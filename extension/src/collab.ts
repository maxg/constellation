import * as vscode from 'vscode';

import * as sharedb from 'sharedb/lib/client';
import { Socket } from 'sharedb/lib/sharedb';

import * as util from './util';

import { EditorDoc } from './editordoc';
import { Feedback } from './feedback';

// type of 'files.exclude' setting
type FilesExclude = { [_: string]: boolean };

// partial type of 'vscode.git' extension, exposing implementation API to check .gitignore matches
interface GitExtension {
  getAPI(version: 1): {
    getRepository(uri: vscode.Uri): null | {
      readonly _repository?: {
        checkIgnore?(filePaths: string[]): Promise<Set<string>>;
      }
    }
  }
}

export class Collaboration {
  
  readonly #git = vscode.extensions.getExtension<GitExtension>('vscode.git');
  
  readonly #socket: Socket;
  readonly connection: sharedb.Connection;
  readonly #user: sharedb.Doc;
  readonly #checkoffs: Promise<sharedb.Query>;
  readonly #remoteTextScheme: string;
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
    this.#remoteTextScheme = `constellation-${settings.collabid}`;
    this.#subscriptions = [
      vscode.workspace.registerTextDocumentContentProvider(this.#remoteTextScheme, {
        provideTextDocumentContent: (uri: vscode.Uri) => this.#remoteText(uri.path),
      }),
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
  
  #remoteText(path: string): string|undefined {
    return this.connection.get('files', this.settings.collabid + '-' + path).data?.text;
  }
  
  async #onLocalOpen(localdoc: vscode.TextDocument) {
    // files outside the collaboration folder are always ignored
    if ( ! localdoc.uri.toString().startsWith(this.folder.uri.toString())) { return; }
    
    if ( ! this.#docs.has(localdoc.uri)) {
      this.#waiting.add(localdoc.uri);
    }
    
    // files ignored for other reasons are left in #waiting so they may be edited
    const exclude = vscode.workspace.getConfiguration('files', localdoc).get<FilesExclude>('exclude');
    if (exclude) {
      const globs = Object.keys(exclude).filter(glob => exclude[glob]);
      const patterns = globs.map(glob => new vscode.RelativePattern(this.folder, glob));
      if (vscode.languages.match(patterns.map(pattern => ({ pattern })), localdoc)) {
        util.log('Collaboration.onLocalOpen files.exclude match', localdoc.uri.path);
        return;
      }
    }
    if (this.#git?.isActive) {
      const repo = this.#git.exports.getAPI(1).getRepository(localdoc.uri)?._repository;
      const ignored = await repo?.checkIgnore?.([ localdoc.uri.path ]);
      if (ignored?.size) {
        util.log('Collaboration.onLocalOpen .gitignore match', localdoc.uri.path);
        return;
      }
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
        const filename = vscode.workspace.asRelativePath(localdoc.uri, false);
        const remoteTextUri = vscode.Uri.parse(`${this.#remoteTextScheme}:${path}`);
        await vscode.commands.executeCommand('vscode.diff', localdoc.uri, remoteTextUri, `Constellation: local ${filename} ↔ remote ${filename}`, { preview: true });
        const warning = `Constellation: ${filename} has remote changes (in green). You must overwrite your local version (in red) in order to collaborate.`;
        const detail = 'Cancel to keep your local version.';
        const overwrite = 'Continue, overwrite with remote';
        const choice = await vscode.window.showWarningMessage(warning, { modal: true, detail }, overwrite);
        if (vscode.window.activeTextEditor?.document.uri.scheme === this.#remoteTextScheme) {
          await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        }
        if (choice !== overwrite) {
          this.#waiting.delete(localdoc.uri);
          if (vscode.window.activeTextEditor?.document.uri.toString() === localdoc.uri.toString()) {
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
      
      this.#waiting.delete(localdoc.uri);
      this.#docs.set(localdoc.uri, new EditorDoc(sharedoc, localdoc, this.settings));
      
      if (localdoc.isDirty) {
        await localdoc.save();
      }
    }
    sharedoc.once('create', () => update());
    sharedoc.subscribe(update);
  }
  
  async #onLocalChange(change: vscode.TextDocumentChangeEvent) {
    if (change.contentChanges.length === 0) { return; }
    const doc = this.#docs.get(change.document.uri);
    if ( ! doc) { return; }
    if (change.contentChanges.some(change => change.text.includes('\r'))) {
      this.#onLocalClose(change.document);
      const filename = vscode.workspace.asRelativePath(change.document.uri, false);
      const warning = `Constellation: ${filename} was modified to contain Windows end-of-line characters.`;
      const detail = `Collaboration on ${filename} will restart with these characters removed.`
      await vscode.window.showWarningMessage(warning, { modal: true, detail });
      this.#onLocalOpen(change.document);
      return;
    }
    doc.onLocalChanges(change.contentChanges);
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
