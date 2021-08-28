/*!
 * Constellation
 * @license MIT
 */

import * as vscode from 'vscode';

import * as util from './util';

import { CollabCommand } from './collabcmd';
import { Feedback } from './feedback';

const collabCommandId = 'constellation.collaborate';
const setupCommandId = 'constellation.setup';

export function activate(context: vscode.ExtensionContext) {
  if (context.extensionMode !== vscode.ExtensionMode.Production) {
    util.development();
  }
  
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
  const feedback = new Feedback(context.extension.extensionUri);
  const cmd = new CollabCommand({ version: context.extension.packageJSON.version }, status, feedback);
  
  context.subscriptions.push(cmd);
  context.subscriptions.push(vscode.commands.registerCommand(collabCommandId, cmd.handleCollab, cmd));
  context.subscriptions.push(vscode.commands.registerCommand(setupCommandId, cmd.handleSetup, cmd));
  context.subscriptions.push(feedback.registerViewProvider());
  context.subscriptions.push(util.registerStringDocProvider());
  
  status.command = collabCommandId;
  status.show();
}

export function deactivate() {
}
