import { strict as assert } from 'assert';

import * as vscode from 'vscode';

import * as sharedb from 'sharedb/lib/client';

import * as util from './util';

import { Collaboration } from './collab';

type State = 'none' | 'pairing' | sharedb.ConnectionState;

const statuses = {
  none: '$(person)Collaborate',
  pairing: '$(globe) Connecting',
  connecting: '$(organization) Connecting',
  connected: '$(organization) Collaborating',
  disconnecting: '$(warning) ...',
  disconnected: '$(warning) Reconnecting',
  closed: '$(error) Disconnected',
  stopped: '$(error) Disconnected',
};

export class CollabCommand {
  
  #state: State;
  #collab: Collaboration|undefined;
  #onConnectionState = (newState: sharedb.ConnectionState) => this.#update(newState);
  
  constructor(readonly config: Config, readonly status: vscode.StatusBarItem) {
    this.#update(this.#state = 'none');
  }
  
  #update(state: State) {
    this.#state = state;
    this.status.text = statuses[state];
  }
  
  handleCollab() {
    if (this.#state === 'none') {
      this.start();
    } else if (this.#state !== 'pairing') {
      this.stop();
    }
  }
  
  async handleSetup() {
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      cancellable: true,
    }, async (progress, token) => {
      await this.#pair('constellation-setup', progress, token);
    });
    vscode.window.showInformationMessage('Constellation: successfully authenticated and connected to the Constellation server', 'OK');
  }
  
  async start() {
    assert( ! this.#collab);
    
    this.#update('pairing');
    
    const folder = await selectFolder();
    if ( ! folder) { return; }
    
    try {
      this.#collab = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        cancellable: true,
      }, async (progress, token) => {
        const settings = await this.#pair(folder.name, progress, token);
        return new Collaboration(folder, settings, progress);
      });
      this.#collab.connection.on('state', this.#onConnectionState);
    } catch (e) {
      this.#update('none');
      if (e instanceof vscode.CancellationError) {
        util.log('CollabCommand.start canceled');
      } else {
        util.error('CollabCommand.start error', e);
      }
    }
  }
  
  async #pair(folder: string, progress: TaskProgress, token: vscode.CancellationToken) {
    const host = vscode.workspace.getConfiguration('constellation').get<string>('host');
    if ( ! host) { throw new Error('no constellation.host configured'); }
    
    progress.report({ message: 'Constellation: authenticating' });
    const { update, userid } = await util.fetch<Metadata>(host, `hello/vscode/${this.config.version}`, token);
    if (update) {
      util.browse(host, `update/vscode/${this.config.version}`);
      vscode.window.showErrorMessage('Please update to the latest version of Contellation');
      throw new vscode.CancellationError();
    }
    progress.report({ increment: 10 });
    
    util.browse(host, `pair/${folder}/${userid}`);
    progress.report({ message: 'Constellation: waiting for pair...', increment: 10 });
    return util.fetch<Settings>(host, `await-collaboration/${userid}`, token);
  }
  
  async stop() {
    assert(this.#collab);
    
    const stop = 'Stop';
    const choice = await vscode.window.showInformationMessage(`Constellation: collaborating on ${this.#collab.folder.name} with ${this.#collab.settings.partner}`, 'Continue', stop);
    
    if (choice === stop) {
      this.#collab.connection.removeListener('state', this.#onConnectionState);
      this.#collab.stop();
      this.#collab = undefined;
      
      this.#update('none');
    }
  }
}

async function selectFolder() {
  const folders = vscode.workspace.workspaceFolders;
  if (folders === undefined) {
    vscode.window.showWarningMessage('Constellation: collaboration requires a workspace (by opening a folder or a `.code-workspace` file)');
    return undefined;
  }
  if (folders.length == 1) {
    return folders[0];
  }
  return vscode.window.showWorkspaceFolderPick({
    placeHolder: 'Constellation: choose a folder to collaborate on',
  });
}
