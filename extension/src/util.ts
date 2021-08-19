import * as util from 'util';

import * as vscode from 'vscode';

import got from 'got';

const channel = vscode.window.createOutputChannel('Constellation');

export function log(...args: any[]) {
  channel.appendLine('ℹ️ ' + util.format(...args));
}

export function error(...args: any[]) {
  channel.show();
  channel.appendLine('❌ ' + util.format(...args));
}

export async function fetch<T>(host: string, path: string, token: vscode.CancellationToken) {
  const req = got(`https://${host}/${path}`);
  const onCancel = token.onCancellationRequested(() => req.cancel());
  try {
    return await req.json() as T;
  } finally {
    onCancel.dispose();
  }
}

export async function browse(host: string, path: string) {
  vscode.env.openExternal(vscode.Uri.parse(`https://${host}/${path}`));
}
