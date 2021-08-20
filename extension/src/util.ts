import * as util from 'util';

import * as vscode from 'vscode';

import got, { CancelError, OptionsOfJSONResponseBody } from 'got';
const WebSocket = require('ws');
const ReconnectingWebSocket = require('reconnecting-websocket');

const channel = vscode.window.createOutputChannel('Constellation');
const fetchOptions: OptionsOfJSONResponseBody = {};
const socketOptions = { WebSocket };

export function log(...args: any[]) {
  channel.appendLine(new Date().toISOString() + ' ℹ️ ' + util.format(...args));
}

export function error(...args: any[]) {
  channel.show();
  channel.appendLine(new Date().toISOString() + ' ❌ ' + util.format(...args));
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
