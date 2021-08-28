import * as vscode from 'vscode';

import * as sharedb from 'sharedb/lib/client';

import * as util from './util';

const viewId = 'constellation-feedback';

export class Feedback {
  
  #staticUri: vscode.Uri;
  #checkoffs: sharedb.Doc[] = [];
  #webview: vscode.Webview|undefined;
  
  constructor(extensionUri: vscode.Uri) {
    this.#staticUri = vscode.Uri.joinPath(extensionUri, 'static');
  }
  
  update(checkoffs: sharedb.Doc[], show: boolean) {
    util.log('Feedback.update');
    this.#checkoffs = checkoffs;
    this.#update();
    if (show) {
      vscode.commands.executeCommand(`workbench.view.extension.constellation`);
    }
  }
  
  #update() {
    if ( ! this.#webview) { return; }
    const host = vscode.workspace.getConfiguration('constellation').get<string>('host')!;
    const css = this.#webview.asWebviewUri(vscode.Uri.joinPath(this.#staticUri, 'constellation.css'));
    this.#webview.html = `
      <!DOCTYPE html><html><head><meta charset="UTF-8">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.#webview.cspSource};">
      <link href="${css}" rel="stylesheet">
      </head><body>
      ${this.#checkoffs.map(doc => this.#entry(doc, host)).join('')}
      </body></html>
    `;
  }
  
  #entry(doc: sharedb.Doc, host: string) {
    const time = doc.data.cutoff || doc.data.modified;
    return `
      <div class="tile-panel-body">
      <p>
      ${doc.data.project} <span class="label label-primary">${doc.data.milestone}</span> comments on work
      ${doc.data.cutoff ? `as of <span class="label label-warning">` : `at <span class="label label-success">`}${time}</span>
      from&nbsp;${doc.data.grader}
      &nbsp;
      <a href="https://${host}/show/${doc.data.project}/${doc.data.collabid}/${time}">(see&nbsp;the&nbsp;snapshot)</a>
      </p>
      <p class="comment-text">${doc.data.comment}</p>
      </div>
    `;
  }
  
  registerViewProvider() {
    return vscode.window.registerWebviewViewProvider(viewId, this);
  }
  
  resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, token: vscode.CancellationToken) {
    this.#webview = webviewView.webview;
    this.#webview.options = {
      localResourceRoots: [ this.#staticUri ],
    }
    this.#update();
  }
}
