import { strict as assert } from 'assert';
import { Server } from 'http';

import ShareDB from 'sharedb';
import { WebSocketServer } from 'ws';
const WebsocketJSONStream = require('@teamwork/websocket-json-stream');

assert(process.send);

const share = new ShareDB();

const server = new Server();
const wsserver = new WebSocketServer({ server });
wsserver.on('connection', socket => {
  share.listen(new WebsocketJSONStream(socket));
});
server.listen();
process.send(server.address());
