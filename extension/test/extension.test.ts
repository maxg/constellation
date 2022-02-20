import { strict as assert } from 'assert';

import * as vscode from 'vscode';

describe('extension', () => {
  it('defines extension', () => {
    assert(vscode.extensions.getExtension('mit-up-group.constellation-vscode'));
  });
});
