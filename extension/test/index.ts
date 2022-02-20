import * as fs from 'fs/promises';
import * as path from 'path';

import Mocha from 'mocha';

export async function run() {
  const mocha = new Mocha();
  
  for (const file of await fs.readdir(__dirname)) {
    if (file.endsWith('.test.js')) {
      mocha.addFile(path.resolve(__dirname, file));
    }
  }
  
  return new Promise<void>((resolve, reject) => {
    mocha.run(failed => failed ? reject(new Error(`Test failures: ${failed}`)) : resolve());
  });
}
