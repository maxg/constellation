import * as vscode from 'vscode';

declare global {
  
  type TaskProgress = Parameters<Parameters<typeof vscode.window.withProgress>[1]>[0];
  
  interface Config {
    readonly version: string;
  }
  
  interface Metadata {
    readonly update?: true;
    readonly userid: string;
  }
  
  interface Settings {
    readonly collabid: string;
    readonly me: string;
    readonly partner: string;
    readonly token: string;
  }
}
