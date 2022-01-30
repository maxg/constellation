import * as vscode from 'vscode';

import * as sharedb from 'sharedb/lib/client';

import * as util from './util';

type StringOp = sharedb.StringInsertOp | sharedb.StringDeleteOp;

const cursorDecoration = vscode.window.createTextEditorDecorationType({
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: new vscode.ThemeColor('merge.currentHeaderBackground'),
  overviewRulerColor: new vscode.ThemeColor('merge.currentHeaderBackground'),
  overviewRulerLane: vscode.OverviewRulerLane.Full,
});
const selectionDecoration = vscode.window.createTextEditorDecorationType({
  backgroundColor: new vscode.ThemeColor('merge.currentContentBackground'),
  borderRadius: '4px',
});

export class EditorDoc {
  
  #localtext: string;
  #applied = Promise.resolve();
  #pending: StringOp[][] = [];
  
  constructor(readonly sharedoc: sharedb.Doc, readonly localdoc: vscode.TextDocument, readonly settings: Settings) {
    this.#localtext = localdoc.getText();
    sharedoc.on('before op batch', this.#beforeOps);
    sharedoc.on('before op', this.#beforeOp);
    sharedoc.on('op', this.#afterOp);
  }
  
  #beforeOps = (ops: any[], source: any) => {
    if (source) { return; } // local op is not in doc yet
    if (this.#pending.length) { return; } // there are remote ops committed but not applied
    if (this.localdoc.getText() !== this.sharedoc.data.text) {
      util.errorOnce(`${this.sharedoc.id} mismatch`, 'EditorDoc.beforeOps mismatch', ...ops, {
        doc: { id: this.sharedoc.id, version: this.sharedoc.version },
        source,
        local: this.localdoc.getText().replace(/\n/g, '⏎'),
        remote: this.sharedoc.data.text.replace(/\n/g, '⏎'),
      });
    }
  };
  
  #beforeOp = ([ op ]: [any], source: any) => {
    if (source) { return; } // local op, ignore
    if (op.p[0] === 'text') {
      this.#onRemoteChange(op);
    }
  };
  
  #afterOp = ([ op ]: [any], source: any) => {
    if (source) { return; } // local op, ignore
    if (op.p[0] === 'cursors') {
      this.#onRemoteCursor(op.p[op.p.length - 1]);
    }
  };
  
  async #onRemoteChange(op: StringOp) {
    util.info('EditorDoc.onRemoteChange', op);
    const ops = [ op ];
    this.#pending.push(ops);
    
    this.#applied = this.#applied.then(async () => {
      // until it succeeds:
      //   convert the possibly-translated op into an edit and attempt to apply it
      while ( ! await vscode.workspace.applyEdit(this.#opsToEdit(ops))) {
        util.info('EditorDoc.onRemoteChange will retry', op, 'as', ...ops);
      }
    });
  }
  
  #opsToEdit(ops: StringOp[]) {
    const edits = new vscode.WorkspaceEdit();
    for (const op of ops) {
      const offset = op.p[1] as number;
      const start = this.localdoc.positionAt(offset);
      if ('si' in op) { // insertion
        edits.insert(this.localdoc.uri, start, op.si);
      } else { // deletion
        const end = this.localdoc.positionAt(offset + op.sd.length);
        edits.delete(this.localdoc.uri, new vscode.Range(start, end));
      }
    }
    return edits;
  }
  
  #isIdentical(prevtext: string, remote: StringOp, local: StringOp) {
    if ('si' in remote ? 'si' in local && remote.si === local.si : 'sd' in local && remote.sd === local.sd) {
      if (remote.p[1] === local.p[1]) { return true; }
      // offsets are clamped on apply by both VS Code and ShareDB
      if (remote.p[1] as number > prevtext.length && local.p[1] === prevtext.length) { return true; }
    }
    return false;
  }
  
  async onLocalChange(changes: readonly vscode.TextDocumentContentChangeEvent[]) {
    const prevtext = this.#localtext;
    this.#localtext = this.localdoc.getText();
    
    let localops: StringOp[] = [];
    
    for (const change of changes) {
      if (change.rangeLength) {
        localops.push({ p: [ 'text', change.rangeOffset ], sd: prevtext.substr(change.rangeOffset, change.rangeLength) });
      }
      if (change.text) {
        localops.push({ p: [ 'text', change.rangeOffset ], si: change.text });
      }
    }
    util.info('EditorDoc.onLocalChange <-', ...localops);
    
    // determine whether these changes are remote edits or new local edits
    while (this.#pending[0] && localops[0]) {
      if ( ! this.#pending[0].length) {
        this.#pending.shift();
      } else {
        if (this.#isIdentical(prevtext, this.#pending[0][0]!, localops[0])) {
          this.#pending[0].shift();
          localops.shift();
        } else {
          break;
        }
      }
    }
    util.info('EditorDoc.onLocalChange ->', ...localops, '|', ...this.#pending);
    if ( ! localops.length) {
      return;
    }
    if (this.#pending.length > 16) {
      util.errorOnce(`${this.sharedoc.id} runaway`, 'EditorDoc.onLocalChange runaway', {
        doc: { id: this.sharedoc.id, version: this.sharedoc.version },
        local: this.localdoc.getText().replace(/\n/g, '⏎'),
        remote: this.sharedoc.data.text.replace(/\n/g, '⏎'),
      });
    }
    
    if (this.#pending.length) {
      const originallocalops = localops;
      const originalpending = this.#pending.flat();
      
      // in the local doc, these local ops preceed the ops in #pending
      // but in the remote doc, the #pending ops are already committed
      // so these local ops must be transformed past the #pending ops for the remote doc
      localops = this.sharedoc.type!.transform(originallocalops, originalpending, 'left');
      
      // and in the local doc, the #pending ops must be transformed to follow these local ops
      // (their applyEdit calls will fail and be retried using these versions)
      const pending: StringOp[] = this.sharedoc.type!.transform(originalpending, originallocalops, 'right');
      
      for (const ops of this.#pending) { ops.splice(0, ops.length, ...pending.splice(0, ops.length)); }
      // if there are fewer transformed #pending ops, the last #pending entry(ies) are now shorter or empty
      // if there are more transformed #pending ops, add them to the last entry
      this.#pending[this.#pending.length-1]!.push(...pending);
    }
    
    for (const localop of localops) {
      this.sharedoc.submitOp(localop);
    }
  }
  
  #onRemoteCursor(username: string) {
    const cursor: [number] | [number, number, number] = this.sharedoc.data.cursors[username];
    const editors = vscode.window.visibleTextEditors.filter(editor => editor.document === this.localdoc);
    const caret = new vscode.Range(this.localdoc.positionAt(cursor[0]), this.localdoc.positionAt(cursor[0]));
    for (const editor of editors) {
      editor.setDecorations(cursorDecoration, [ { hoverMessage: username, range: caret } ]);
    }
    const highlight = cursor.length === 3 ? [ {
      range: new vscode.Range(this.localdoc.positionAt(cursor[1]), this.localdoc.positionAt(cursor[1] + cursor[2])),
    } ] : [];
    for (const editor of editors) {
      editor.setDecorations(selectionDecoration, highlight);
    }
  }
  
  onLocalCursor(selections: readonly vscode.Selection[]) {
    const selection = selections[0];
    if ( ! selection) { return; }
    const caret = this.localdoc.offsetAt(selection.active);
    this.sharedoc.submitOp({
      p: [ 'cursors', this.settings.me ],
      oi: selection.isEmpty ? [ caret ] : [ caret, this.localdoc.offsetAt(selection.start), this.localdoc.offsetAt(selection.end) - this.localdoc.offsetAt(selection.start) ],
    });
  }
  
  stop() {
    if (this.#pending[0]?.length) { util.error('EditorDoc.stop pending', ...this.#pending); }
    this.sharedoc.removeListener('before op batch', this.#beforeOps);
    this.sharedoc.removeListener('before op', this.#beforeOp);
    this.sharedoc.removeListener('op', this.#afterOp);
  }
}
