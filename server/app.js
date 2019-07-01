const fs = require('fs');
const http = require('http');
const https = require('https');
const ws = require('ws');
const websocketjsonstream = require('websocket-json-stream');

const config = require('./config');
const logger = require('./logger');

(async function app() {
  
  const log = logger.log.child({ in: 'app' });
  const db = await require('./db').createBackend(config);
  const web = await require('./web').createFrontend(config, db);
  
  const servers = {
    web: https.createServer({
      key: fs.readFileSync(`${config.dir}/ssl-private-key.pem`),
      cert: fs.readFileSync(`${config.dir}/ssl-certificate.pem`),
      ca: fs.readdirSync(config.dir)
            .filter(f => /ssl-intermediate/.test(f))
            .map(f => fs.readFileSync(`${config.dir}/${f}`)),
    }, web),
    websocket: https.createServer({
      key: fs.readFileSync(`${config.dir}/ssl-private-key.pem`),
      cert: fs.readFileSync(`${config.dir}/ssl-certificate.pem`),
      ca: fs.readdirSync(config.dir)
            .filter(f => /ssl-intermediate/.test(f))
            .map(f => fs.readFileSync(`${config.dir}/${f}`)),
    }),
  };
  
  // connect websocket to share
  
  new ws.Server({ server: servers.websocket }).on('connection', function(connection, req) {
    connection.on('error', err => log.error({ err }, 'WebSocket error'));
    let stream = new websocketjsonstream(connection);
    stream.authusername = db.tokenUsername(req.url.substr(1));
    stream.push = function push(chunk, encoding) {
      if (chunk && chunk.a === 'ping') {
        return db.ping(chunk.collabid);
      }
      websocketjsonstream.prototype.push.call(this, chunk, encoding);
    };
    stream._write = function _write(msg, encoding, next) {
      if (this.ws.readyState !== ws.OPEN) {
        return next(new Error('WebSocket must be OPEN to send'));
      }
      websocketjsonstream.prototype._write.call(this, msg, encoding, next);
    };
    db.share.listen(stream);
  });
  
  // start listening
  
  servers.web.listen(config.web.https, function() {
    log.info({ address: servers.web.address() }, 'Web server listening');
  });
  servers.websocket.listen(config.web.wss, function() {
    log.info({ address: servers.websocket.address() }, 'WebSocket server listening');
  });
  if (config.web.httpUpdateSite) {
    servers.update = http.createServer(web.createUpdateSite());
    servers.update.listen(config.web.httpUpdateSite, function() {
      log.info({ address: servers.update.address() }, 'HTTP update site listening');
    });
  }
  
})();
