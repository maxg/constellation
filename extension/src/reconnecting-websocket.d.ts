import * as ws from 'ws';

declare module 'reconnecting-websocket' {
  type MessageEvent = ws.MessageEvent;
  type BinaryType = 'arraybuffer';
  type Blob = never;
}

declare module 'reconnecting-websocket/dist/events' {
  type MessageEvent = ws.MessageEvent;
}
