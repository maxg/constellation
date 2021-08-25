/*!
 * Constellation
 * @license MIT
 */

import * as vscode from 'vscode';

import * as util from './util';

import { CollabCommand } from './collabcmd';

const collabCommandId = 'constellation.collaborate';
const setupCommandId = 'constellation.setup';

export function activate(context: vscode.ExtensionContext) {
  if (context.extensionMode !== vscode.ExtensionMode.Production) {
    util.development();
  }
  
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
  const cmd = new CollabCommand({ version: context.extension.packageJSON.version }, status);
  
  context.subscriptions.push(vscode.commands.registerCommand(collabCommandId, cmd.handleCollab, cmd));
  context.subscriptions.push(vscode.commands.registerCommand(setupCommandId, cmd.handleSetup, cmd));
  context.subscriptions.push(util.registerStringDocProvider());
  
  status.command = collabCommandId;
  status.show();
}

export function deactivate() {
}
