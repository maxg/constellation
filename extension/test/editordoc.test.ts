import { strict as assert } from 'assert';
import { EventEmitter } from 'events';
import * as path from 'path';
import { fork } from 'child_process';

import * as vscode from 'vscode';

import * as sharedb from 'sharedb/lib/client';
import { WebSocket } from 'ws';

import { internal as constellation } from '../dist/constellation';

import { randomEdit } from './editordoc.random';

describe('EditorDoc', function() {
  
  type Fix = Awaited<ReturnType<typeof setup>>;
  
  async function setup(test: Mocha.Runnable) {
    // connect to ShareDB server
    const server = fork(path.resolve(__dirname, 'editordoc.server.js'));
    const port = await new Promise<number>(resolve => server.once('message', (obj: { port: number }) => resolve(obj.port)));
    const conn = new sharedb.Connection(new WebSocket(`ws://localhost:${port}`));
    
    // create test document: local ShareDB doc, local VS Code doc, EditorDoc
    const name = test.title;
    const sharedoc = conn.get('test', name);
    await new Promise<void>((resolve, reject) => {
      sharedoc.subscribe(err => {
        if (err) { return reject(err); }
        sharedoc.create({
          collabid: 'test',
          project: 'test',
          filepath: name,
          text: '',
          cursors: {},
          markers: {},
        }, err => err ? reject(err) : resolve());
      });
    });
    const localdoc = await vscode.workspace.openTextDocument(vscode.Uri.file(name).with({ scheme: 'untitled' }));
    const settings = { collabid: 'test', me: 'tester', partner: 'other', token: 'test' };
    const doc = new constellation.EditorDoc(sharedoc, localdoc, settings);
    
    // independent view of ShareDB doc
    const otherdoc = new sharedb.Connection(new WebSocket(`ws://localhost:${port}`)).get('test', name);
    await new Promise<void>((resolve, reject) => otherdoc.subscribe(err => err ? reject(err) : resolve()));
    
    const changes = new EventEmitter();
    const subs = [
      vscode.workspace.onDidChangeTextDocument(change => {
        if (change.document === localdoc) {
          doc.onLocalChanges(change.contentChanges);
          changes.emit('change');
        }
      }),
    ];
    
    assert.strictEqual(sharedoc.data.text, '');
    assert.strictEqual(otherdoc.data.text, '');
    assert.strictEqual(localdoc.getText(), '');
    
    return { name, server, port, sharedoc, otherdoc, localdoc, doc, changes, subs };
  }
  
  async function teardown({ server, sharedoc, doc, subs }: Fix) {
    subs.forEach(sub => sub.dispose());
    doc.stop();
    sharedoc.destroy();
    while (vscode.window.activeTextEditor) {
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    }
    server.kill();
  }
  
  after(async function() {
    console.log(await constellation.util.debugGetLog());
  });
  
  it('remote to local', async function() {
    const fix: Fix = await setup(this.test!);
    const { sharedoc, otherdoc, localdoc, changes } = fix;
    
    try {
      const edit = { p: [ 'text', 0 ], si: 'insert' };
      
      // one edit
      await Promise.all([
        new Promise(resolve => sharedoc.once('op batch', resolve)),
        new Promise(resolve => otherdoc.once('op batch', resolve)),
        new Promise(resolve => changes.once('change', resolve)),
        new Promise<void>((resolve, reject) => otherdoc.submitOp(edit, {}, err => err ? reject(err) : resolve())),
      ]);
      
      assert.strictEqual(sharedoc.data.text, 'insert');
      assert.strictEqual(otherdoc.data.text, 'insert');
      assert.strictEqual(localdoc.getText(), 'insert');
      
      // no further edits
      await Promise.race([
        new Promise((_, reject) => sharedoc.once('op batch', reject)),
        new Promise((_, reject) => otherdoc.once('op batch', reject)),
        new Promise((_, reject) => changes.once('change', reject)),
        new Promise(resolve => setTimeout(resolve, 100)),
      ]);
    } finally {
      await teardown(fix);
    }
  });
  
  it('local to remote', async function() {
    const fix: Fix = await setup(this.test!);
    const { sharedoc, otherdoc, localdoc, changes } = fix;
    
    try {
      const edit = new vscode.WorkspaceEdit();
      edit.insert(localdoc.uri, new vscode.Position(0, 0), 'insert');
      
      // one edit
      await Promise.all([
        new Promise(resolve => sharedoc.once('op batch', resolve)),
        new Promise(resolve => otherdoc.once('op batch', resolve)),
        new Promise(resolve => changes.once('change', resolve)),
        vscode.workspace.applyEdit(edit),
      ]);
      
      assert.strictEqual(sharedoc.data.text, 'insert');
      assert.strictEqual(otherdoc.data.text, 'insert');
      assert.strictEqual(localdoc.getText(), 'insert');
      
      // no further edits
      await Promise.race([
        new Promise((_, reject) => sharedoc.once('op batch', reject)),
        new Promise((_, reject) => otherdoc.once('op batch', reject)),
        new Promise((_, reject) => changes.once('change', reject)),
        new Promise(resolve => setTimeout(resolve, 100)),
      ]);
    } finally {
      await teardown(fix);
    }
  });
  
  it('random', async function() {
    this.timeout(1000 * 30);
    const fix: Fix = await setup(this.test!);
    const { name, port, localdoc, changes } = fix;
    
    try {
      vscode.window.showTextDocument(localdoc);
      fork(path.resolve(__dirname, 'editordoc.random.js')).send({ port, name });
      
      const text = 'abcdefghijklmnopqrstuvwx\ny\nz\n';
      for (let ii = 0; ii < 100; ii++) {
        const edit = new vscode.WorkspaceEdit();
        const { del, rem, ins, add } = randomEdit(localdoc.getText().length);
        if (rem) {
          edit.delete(localdoc.uri, new vscode.Range(localdoc.positionAt(del), localdoc.positionAt(del+rem)));
        }
        if (add) {
          edit.insert(localdoc.uri, localdoc.positionAt(ins), text.substr(ii % text.length, add));
        }
        await vscode.workspace.applyEdit(edit);
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
      }
      let changed = true;
      while (changed) {
        changed = false;
        changes.once('change', () => { changed = true });
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } finally {
      await teardown(fix);
    }
  });
});
