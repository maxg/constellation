import * as vscode from 'vscode';

import * as sharedb from 'sharedb/lib/client';

import * as util from './util';

type TextOp = (sharedb.StringInsertOp | sharedb.StringDeleteOp) & { p: readonly [ 'text', number ] };

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
  #pending: TextOp[] = [];
  
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
  
  async #onRemoteChange(op: TextOp) {
    util.info('EditorDoc.onRemoteChange', op);
    if (this.#pending.length) {
      // add to existing queue
      this.#pending.push(op);
    } else {
      // create a new queue and start a loop to apply its ops
      const pending = this.#pending = [ op ];
      // until it succeeds:
      //   convert the possibly-transformed next op into an edit and attempt to apply it
      while (pending[0]) {
        const op = pending[0];
        if ( ! await vscode.workspace.applyEdit(this.#opToEdit(op))) {
          util.info('EditorDoc.onRemoteChange will retry', op, 'as', pending[0]);
        }
      }
    }
  }
  
  #opToEdit(op: TextOp) {
    const edits = new vscode.WorkspaceEdit();
    const offset = op.p[1];
    const start = this.localdoc.positionAt(offset);
    if ('si' in op) { // insertion
      edits.insert(this.localdoc.uri, start, op.si);
    } else { // deletion
      const end = this.localdoc.positionAt(offset + op.sd.length);
      edits.delete(this.localdoc.uri, new vscode.Range(start, end));
    }
    return edits;
  }
  
  #isIdentical(prevtext: string, remote: TextOp, local: TextOp) {
    if ('si' in remote ? 'si' in local && remote.si === local.si : 'sd' in local && remote.sd === local.sd) {
      if (remote.p[1] === local.p[1]) { return true; }
      // offsets are clamped on apply by both VS Code and ShareDB
      if (remote.p[1] as number > prevtext.length && local.p[1] === prevtext.length) { return true; }
    }
    return false;
  }
  
  #areIdentical(prevtext: string, remote: TextOp[], local: TextOp[]) {
    function* ops() {
      const remoteIter = remote[Symbol.iterator](), localIter = local[Symbol.iterator]();
      while (true) {
        const remote = remoteIter.next(), local = localIter.next();
        if (remote.done && local.done) { return; }
        yield [ remote, local ] as const;
      }
    }
    for (const [ remote, local ] of ops()) {
      if (remote.done !== local.done) { return false; }
      if ( ! this.#isIdentical(prevtext, remote.value, local.value)) { return false; }
    }
    return true;
  }
  
  onLocalChanges(changes: readonly vscode.TextDocumentContentChangeEvent[]) {
    const prevtext = this.#localtext;
    this.#localtext = this.localdoc.getText();
    
    let localops: TextOp[] = [];
    
    for (const change of changes) {
      if (change.rangeLength) {
        localops.push({ p: [ 'text', change.rangeOffset ], sd: prevtext.substr(change.rangeOffset, change.rangeLength) });
      }
      if (change.text) {
        localops.push({ p: [ 'text', change.rangeOffset ], si: change.text });
      }
    }
    util.info('EditorDoc.onLocalChange <-', ...localops, '|', ...this.#pending);
    
    canceling:
    while (this.#pending[0]) {
      let remoteops = [ this.#pending[0] ];
      for (let idx = 0; idx <= localops.length-remoteops.length; idx++) {
        if (this.#areIdentical(prevtext, remoteops, localops.slice(idx, idx+remoteops.length))) {
          // localops includes the next pending remote op: remove it,
          // and since remoteop is already committed in the remote doc,
          // any local ops that preceeded it must be transformed past remoteop for the remote doc
          if (localops.length > remoteops.length) {
            util.log('EditorDoc.onLocalChange cancel', ...localops, 'merged with', this.#pending[0]);
          }
          const preceeding: TextOp[] = this.sharedoc.type!.transform(localops.slice(0, idx), remoteops, 'left');
          localops = [ ...preceeding, ...localops.slice(idx+remoteops.length) ];
          if (localops.length) {
            util.log('EditorDoc.onLocalChange canceled to', ...localops, 'after', ...remoteops);
          }
          this.#pending.shift();
          continue canceling;
        } else {
          // now looking for remoteop after this localop
          remoteops = this.sharedoc.type!.transform(remoteops, localops.slice(idx, idx+1), 'right');
        }
      }
      // localops does not include the next pending remote op
      break;
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
      const originalpending = this.#pending;
      
      // in the local doc, these local ops preceed the ops in #pending
      // but in the remote doc, the #pending ops are already committed
      // so these local ops must be transformed past the #pending ops for the remote doc
      localops = this.sharedoc.type!.transform(originallocalops, originalpending, 'left');
      
      // and in the local doc, the #pending ops must be transformed to follow these local ops
      // (their applyEdit calls will fail and be retried using these versions)
      const pending: TextOp[] = this.sharedoc.type!.transform(originalpending, originallocalops, 'right');
      this.#pending.splice(0, this.#pending.length, ...pending);
    }
    
    util.info('EditorDoc.onLocalChange =>', ...localops, '|', ...this.#pending);
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
    if (this.#pending.length) { util.error('EditorDoc.stop pending', ...this.#pending); }
    this.sharedoc.removeListener('before op batch', this.#beforeOps);
    this.sharedoc.removeListener('before op', this.#beforeOp);
    this.sharedoc.removeListener('op', this.#afterOp);
  }
}
