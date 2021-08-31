import * as vscode from 'vscode';

import * as sharedb from 'sharedb/lib/client';
import { Socket } from 'sharedb/lib/sharedb';

import * as util from './util';

import { EditorDoc } from './editordoc';
import { Feedback } from './feedback';

export class Collaboration {
  
  readonly #socket: Socket;
  readonly connection: sharedb.Connection;
  readonly #user: sharedb.Doc;
  readonly #checkoffs: Promise<sharedb.Query>;
  readonly #docs = new Map<vscode.Uri, EditorDoc>();
  readonly #waiting = new WeakSet<vscode.Uri>();
  readonly #subscriptions: vscode.Disposable[];
  
  constructor(readonly folder: vscode.WorkspaceFolder, readonly settings: Settings, readonly feedback: Feedback, progress: TaskProgress) {
    util.log('Collaboration.new', folder.name, settings.me, settings.partner, settings.collabid);
    const [ host, port ] = vscode.workspace.getConfiguration('constellation').get<string>('host')!.split(':');
    this.#socket = util.connect(`${host}:${(port ? parseInt(port) : 443) + 1}`, settings.token);
    this.connection = new sharedb.Connection(this.#socket);
    this.connection.on('state', (newState, reason) => util.log('Connection state', newState));
    this.#user = this.connection.get('users', settings.me);
    this.#checkoffs = new Promise(resolve => this.#user.fetch(() => resolve(this.#setupCheckoffs())));
    this.#subscriptions = [
      vscode.workspace.onDidOpenTextDocument(this.#onLocalOpen, this),
      vscode.workspace.onDidCloseTextDocument(this.#onLocalClose, this),
      vscode.workspace.onDidChangeTextDocument(this.#onLocalChange, this),
      vscode.window.onDidChangeTextEditorSelection(this.#onLocalCursor, this),
      vscode.window.onDidChangeActiveTextEditor(this.#onEditor, this),
    ];
    vscode.workspace.textDocuments.forEach(doc => this.#onLocalOpen(doc));
  }
  
  #setupCheckoffs() {
    const now = new Date();
    const query = this.connection.createSubscribeQuery('checkoffs', {
      published: true,
      comment: { $ne: '' },
      modified: { $gt: new Date(now.valueOf() - now.getTimezoneOffset()*60*1000).toISOString().substr(0, 10) },
      collabid: { $in: this.#user.data.collabs.slice(0, 10) },
      $sort: { modified: -1 },
    });
    query.on('ready', () => this.feedback.update(query.results, false));
    query.on('insert', () => this.feedback.update(query.results, true));
    return query;
  }
  
  #onLocalOpen(localdoc: vscode.TextDocument) {
    if ( ! localdoc.uri.toString().startsWith(this.folder.uri.toString())) { return; }
    
    if ( ! this.#docs.has(localdoc.uri)) {
      this.#waiting.add(localdoc.uri);
    }
    
    const path = vscode.workspace.asRelativePath(localdoc.uri, false);
    const sharedoc = this.connection.get('files', this.settings.collabid + '-' + path);
    const update = async (err?: sharedb.Error) => {
      const text = localdoc.getText().replace(/\r\n/g, '\n');
      
      if ( ! sharedoc.type) {
        // duplicated in server/static/edit.js
        return sharedoc.create({
          collabid: this.settings.collabid,
          project: this.folder.name,
          filepath: path,
          text,
          cursors: {},
          markers: {},
        }, err => {
          if (err && err.code !== sharedb.Error.CODES.ERR_DOC_ALREADY_CREATED) {
            util.error('Collaboration.onLocalOpen error creating document', err);
          }
        });
      }
      
      if (text !== sharedoc.data.text) {
        util.log('Collaboration.onLocalOpen mismatch');
        // in case the just-opened editor is not pinned and would be replaced by the diff
        await vscode.window.showTextDocument(localdoc, { preserveFocus: true, preview: false });
        const filename = vscode.workspace.asRelativePath(localdoc.uri, false)
        await vscode.commands.executeCommand('vscode.diff', localdoc.uri, util.stringDoc(sharedoc.data.text), `Constellation: local ${filename} ↔ remote ${filename}`, { preview: true });
        const overwrite = 'Continue, overwrite with remote';
        const choice = await vscode.window.showWarningMessage(`Constellation: ${filename} has remote changes (in green). You must overwrite your local version (in red) in order to collaborate.`, 'Cancel, keep local', overwrite);
        if (vscode.window.activeTextEditor?.document.uri.scheme === 'constellation') {
          vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        }
        if (choice !== overwrite) {
          this.#waiting.delete(localdoc.uri);
          if (vscode.window.activeTextEditor?.document.uri === localdoc.uri) {
            vscode.commands.executeCommand('workbench.action.closeActiveEditor');
          }
          return;
        }
      }
      
      if (localdoc.eol !== vscode.EndOfLine.LF) {
        const edit = new vscode.WorkspaceEdit();
        edit.set(localdoc.uri, [ vscode.TextEdit.setEndOfLine(vscode.EndOfLine.LF) ]);
        await vscode.workspace.applyEdit(edit);
      }
      
      if (localdoc.getText() !== sharedoc.data.text) {
        util.log('Collaboration.onLocalOpen overwrite');
        const edit = new vscode.WorkspaceEdit();
        const all = new vscode.Range(new vscode.Position(0, 0), localdoc.positionAt(localdoc.getText().length));
        edit.replace(localdoc.uri, all, sharedoc.data.text);
        await vscode.workspace.applyEdit(edit);
      }
      
      if (localdoc.isDirty) {
        await localdoc.save();
      }
      
      this.#waiting.delete(localdoc.uri);
      this.#docs.set(localdoc.uri, new EditorDoc(sharedoc, localdoc, this.settings));
    }
    sharedoc.once('create', () => update());
    sharedoc.subscribe(update);
  }
  
  #onLocalChange(change: vscode.TextDocumentChangeEvent) {
    if (change.contentChanges.length === 0) { return; }
    this.#docs.get(change.document.uri)?.onLocalChange(change.contentChanges);
  }
  
  #onLocalCursor(change: vscode.TextEditorSelectionChangeEvent) {
    this.#docs.get(change.textEditor.document.uri)?.onLocalCursor(change.selections);
  }
  
  #onLocalClose(doc: vscode.TextDocument) {
    if ( ! doc.uri.toString().startsWith(this.folder.uri.toString())) { return; }
    this.#docs.get(doc.uri)?.stop();
    this.#docs.delete(doc.uri);
  }
  
  #onEditor(editor?: vscode.TextEditor) {
    if ( ! editor) { return; }
    if ( ! editor.document.uri.toString().startsWith(this.folder.uri.toString())) { return; }
    if (this.#docs.has(editor.document.uri)) { return; }
    if (this.#waiting.has(editor.document.uri)) { return; }
    vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  }
  
  stop() {
    util.log('Collaboration.stop', this.settings.collabid);
    for (const doc of this.#docs.values()) {
      doc.stop();
      doc.sharedoc.destroy();
    }
    this.#checkoffs.then(query => {
      query.removeAllListeners('ready');
      query.removeAllListeners('insert');
      query.destroy();
    });
    this.#user.destroy();
    this.connection.close();
    for (const subscription of this.#subscriptions) {
      subscription.dispose();
    }
  }
}
