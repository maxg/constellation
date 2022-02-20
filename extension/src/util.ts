import * as util from 'util';

import * as vscode from 'vscode';

import got, { CancelError, OptionsOfJSONResponseBody } from 'got';
const WebSocket = require('ws');
const ReconnectingWebSocket = require('reconnecting-websocket');

const constellation = '🌌 Constellation';
const infoRing = new Array(128);
let errorHelp = true;
const errorOnceIds = new Set<string>();
const channel = vscode.window.createOutputChannel('Constellation');
const fetchOptions: OptionsOfJSONResponseBody = {};
const socketOptions = { WebSocket };

log(constellation);

export function info(...args: any[]) {
  infoRing.shift();
  infoRing.push(new Date().toISOString() + ' 🟪 ' + util.format(...args));
}

export function log(...args: any[]) {
  channel.appendLine(new Date().toISOString() + ' 🟦 ' + util.format(...args));
}

export function error(...args: any[]) {
  debugDumpInfo();
  channel.appendLine(new Date().toISOString() + ' 🟥 ' + util.format(...args));
  if (errorHelp) {
    errorHelp = false;
    channel.appendLine(`🐛 Please report this Constellation bug (include all log output & info)`);
    channel.appendLine(`🐛 vscode ${vscode.version} (${process.platform})`);
    channel.appendLine('🐛 ' + vscode.extensions.all.filter(ext => {
      return ext.isActive && ! ext.id.startsWith('vscode.');
    }).map(ext => {
      return `${ext.id} ${ext.packageJSON.version}`;
    }).join(', '));
  }
}

export function errorOnce(id: string, ...args: any[]) {
  if (errorOnceIds.has(id)) { return; }
  errorOnceIds.add(id);
  error(...args);
}

export function debugDumpInfo() {
  channel.show(true);
  channel.appendLine('[begin info ring] ' + new Date().toISOString());
  for (const msg of infoRing) {
    if (msg) { channel.appendLine(msg); }
  }
  channel.appendLine('[end info ring] see above for intervening log messages');
}

export function debugGetLog() {
  debugDumpInfo();
  return new Promise<string|undefined>(resolve => {
    setTimeout(() => {
      resolve(vscode.workspace.textDocuments.find(doc => {
        return doc.uri.scheme === 'output' && doc.getText().includes(constellation);
      })?.getText());
    }, 1000);
  });
}

export function development() {
  log('🛠', 'warning: development mode');
  fetchOptions.https = { rejectUnauthorized: false };
  socketOptions.WebSocket = class extends WebSocket {
    constructor(url: string, protocols?: string[]) {
      super(url, protocols, { rejectUnauthorized: false });
    }
  };
}

export async function fetch<T>(host: string, path: string, token: vscode.CancellationToken) {
  const req = got(`https://${host}/${path}`, fetchOptions);
  const onCancel = token.onCancellationRequested(() => req.cancel());
  try {
    return await req.json() as T;
  } catch (e) {
    if (e instanceof CancelError) {
      throw new vscode.CancellationError();
    } else {
      throw e;
    }
  } finally {
    onCancel.dispose();
  }
}

export function connect(host: string, path: string) {
  return new ReconnectingWebSocket(`wss://${host}/${path}`, [], socketOptions);
}

export async function browse(host: string, path: string) {
  vscode.env.openExternal(vscode.Uri.parse(`https://${host}/${path}`));
}
