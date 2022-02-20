import * as sharedb from 'sharedb/lib/client';
import { WebSocket } from 'ws';

interface RandomEdit {
  /** Deletion offset. */
  del: number;
  /** Number of chars to delete. */
  rem: number;
  /** Insertion offset. */
  ins: number;
  /** Number of chars to insert. */
  add: number;
}

export function randomEdit(length: number): RandomEdit {
  const mid = length / 2;
  const big = Math.random() < .1;
  const del = Math.max(0, Math.min(length, big ? 2 : Math.ceil(mid - Math.random()*5)));
  const end = Math.max(0, Math.min(length, big ? length - 2 : Math.floor(mid + Math.random()*5)));
  const rem = Math.max(0, end - del);
  const ins = Math.max(0, Math.min(length - rem, Math.round(mid - 10 + Math.random()*5)));
  const add = Math.floor(Math.random()*12);
  return { del, rem, ins, add };
}

function sendRandomEdits(port: number, name: string) {
  const conn = new sharedb.Connection(new WebSocket(`ws://localhost:${port}`));
  const sharedoc = conn.get('test', name);
  sharedoc.subscribe(async err => {
    if (err) { throw err; }
    const text = 'ABC\nDEF\nGHIJKLMNOPQRSTUVWXYZ\n';
    for (let ii = 0; ii < 1000; ii++) {
      const ops: any[] = [];
      const { del, rem, ins, add } = randomEdit(sharedoc.data.text.length);
      if (rem) {
        ops.push({ p: ['text',del], sd: sharedoc.data.text.substr(del, rem) });
      }
      if (add) {
        ops.push({ p: ['text',ins], si: text.substr(ii % text.length, add) });
      }
      if (ops.length) {
        await new Promise(resolve => sharedoc.submitOp(ops, {}, resolve));
      }
      await new Promise(resolve => setTimeout(resolve, Math.random() * 150));
    }
  });
}

if (process.send) {
  process.once('message', ({ port, name }) => sendRandomEdits(port, name));
}
