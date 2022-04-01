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
  readonly #pending: { remote: TextOp[], local: TextOp[] } = {
    remote: [],
    local: [],
  };
  #stopped = false;
  
  constructor(readonly sharedoc: sharedb.Doc, readonly localdoc: vscode.TextDocument, readonly settings: Settings) {
    this.#localtext = localdoc.getText();
    sharedoc.on('before op batch', this.#beforeOps);
    sharedoc.on('before op', this.#beforeOp);
    sharedoc.on('op', this.#afterOp);
  }
  
  #beforeOps = (ops: any[], source: any) => {
    if (source) { return; } // local op is not in doc yet
    if (this.#pending.remote.length) { return; } // there are remote ops committed but not applied
    if (this.localdoc.getText() !== this.sharedoc.data.text) {
      util.errorOnce(`${this.sharedoc.id} beforeOps mismatch`, 'EditorDoc.beforeOps mismatch', ...ops, {
        doc: { id: this.sharedoc.id, version: this.sharedoc.version, pending: this.sharedoc.hasWritePending() },
        source,
        local: this.localdoc.getText().replace(/\n/g, '⏎'),
        remote: this.sharedoc.data.text.replace(/\n/g, '⏎'),
      });
    }
  };
  
  #beforeOp = ([ op ]: [any], source: any) => {
    if (source) { return; } // local op, ignore
    if ( ! op) { return; } // no-op
    if (op.p[0] === 'text') {
      this.#onRemoteChange(op);
    }
  };
  
  #afterOp = ([ op ]: [any], source: any) => {
    if (source) { return; } // local op, ignore
    if ( ! op) { return; } // no-op
    if (op.p[0] === 'cursors') {
      this.#onRemoteCursor(op.p[op.p.length - 1]);
    }
  };
  
  async #onRemoteChange(op: TextOp) {
    util.info('EditorDoc ops   .<-', op);
    this.#pending.remote.push(op);
    if (this.#pending.remote.length > 1) {
      return; // an apply loop is already running
    }
    // start an apply loop
    while (this.#pending.remote[0]) {
      const remote = this.#pending.remote[0];
      // give up control to apply remote op, during which:
      // onLocalChanges callback will occur, appending to #pending.local
      // onRemoteChange callback may occur, appending to nonempty #pending.remote
      // stop may be called
      const applied = await vscode.workspace.applyEdit(this.#opToEdit(remote));
      if (this.#stopped) {
        return;
      }
      if (applied) {
        // local change contains remote
        this.#pending.remote.shift();
        this.#subtractApplied(remote);
      } else {
        util.info('EditorDoc ops xx.  ', ...this.#pending.local, 'nope', remote, '|', ...this.#pending.remote);
      }
      if ( ! this.#pending.local.length) {
        // local change was entirely application of remote edits, or applyEdit failed with no intervening local edits
        continue;
      }
      util.info('EditorDoc ops ~>.  ', ...this.#pending.local, '|', ...this.#pending.remote);
      // in the local doc, these local ops preceed the ops in #pending.remote
      // but in the remote doc, the #pending.remote ops are already committed
      // so these local ops must be transformed past the remote ops for the remote doc
      const xformedlocal: TextOp[] = this.sharedoc.type!.transform(this.#pending.local, this.#pending.remote, 'left');
      // and in the local doc, the remote ops must be transformed to follow these local ops
      const xformedremote: TextOp[] = this.sharedoc.type!.transform(this.#pending.remote, this.#pending.local, 'right');
      this.#pending.remote = xformedremote;
      this.#pending.local = [];
      util.info('EditorDoc ops   .~>', ...xformedlocal, '|', ...this.#pending.remote);
      this.sharedoc.submitOp(xformedlocal, undefined, err => {
        if (err) { util.error('EditorDoc xform submitOp', err, ...xformedlocal, '|', ...xformedremote); }
      });
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
  
  #subtractApplied(remote: TextOp) {
    const origremote = remote;
    // try the fast path: remote appears (possibly translated) in #pending.local
    for (const [ idx, op ] of this.#pending.local.entries()) {
      if (op.p[1] === remote.p[1] && ('si' in op ? 'si' in remote && op.si === remote.si : 'sd' in remote && op.sd === remote.sd)) {
        util[idx ? 'log' : 'info']('EditorDoc ops >>.  ', ...this.#pending.local, `[${idx}]=`, origremote, '|', ...this.#pending.remote);
        // fast path success: remove the remote op, and for any local ops that preceeded it,
        // transform them past the remote op since it is already committed in the remote doc
        const preceeding: TextOp[] = this.sharedoc.type!.transform(this.#pending.local.slice(0, idx), [ remote ], 'left');
        this.#pending.local.splice(0, idx+1, ...preceeding);
        return;
      }
      // now looking for remote after this local op...
      const [ first, ...rest ]: [ TextOp|undefined, TextOp[] ] = this.sharedoc.type!.transform([ remote ], [ op ], 'right');
      if ( ! first || rest.length) {
        break; // ... but if remote op is shattered by the transform, take the slow path
      }
      remote = first;
    }
    util.log('EditorDoc ops __.  ', ...this.#pending.local, 'incl', origremote, '|', ...this.#pending.remote);
    // slow path: remote has been subsumed by local edits,
    // unapply it in the remote doc and then allow it to be reapplied the course of applying the local edits
    this.#pending.local.unshift(...this.sharedoc.type!.invert!([ origremote ]));
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
    
    if (this.#pending.remote.length) {
      // a remote op is pending and localops might include it
      util.info('EditorDoc ops ->.  ', ...localops, '|', ...this.#pending.remote);
      this.#pending.local.push(...localops);
    } else {
      // since no remote ops are pending, these local ops are ready to send
      util.info('EditorDoc ops ->.->', ...localops);
      if (prevtext !== this.sharedoc.data.text) {
        util.errorOnce(`${this.sharedoc.id} onLocalChanges mismatch`, 'EditorDoc.onLocalChanges mismatch', ...localops, {
          doc: { id: this.sharedoc.id, version: this.sharedoc.version, pending: this.sharedoc.hasWritePending() },
          local: prevtext.replace(/\n/g, '⏎'),
          remote: this.sharedoc.data.text.replace(/\n/g, '⏎'),
        });
      }
      this.sharedoc.submitOp(localops, undefined, err => {
        if (err) { util.error('EditorDoc clean submitOp', err, ...localops, '|', ...this.#pending.remote); }
      });
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
    this.#stopped = true;
    if (this.#pending.remote.length || this.#pending.local.length) {
      util.log('EditorDoc.stop pending', ...this.#pending.local, '|', ...this.#pending.remote);
    }
    this.sharedoc.removeListener('before op batch', this.#beforeOps);
    this.sharedoc.removeListener('before op', this.#beforeOp);
    this.sharedoc.removeListener('op', this.#afterOp);
  }
}
