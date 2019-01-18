const fs = require('fs');
const http = require('http');
const https = require('https');
const ws = require('ws');
const websocketjsonstream = require('websocket-json-stream');
const x509 = require('x509');

const config = require('./config');
const logger = require('./logger');

const log = logger.log.child({ in: 'app' });
const db = require('./db').createBackend(config);
const web = require('./web').createFrontend(config, db);

const servers = {
  web: https.createServer({
    key: fs.readFileSync(`${config.dir}/ssl-private-key.pem`),
    cert: fs.readFileSync(`${config.dir}/ssl-certificate.pem`),
    ca: fs.readdirSync(config.dir)
          .filter(f => /ssl-ca|ssl-intermediate/.test(f))
          .map(f => fs.readFileSync(`${config.dir}/${f}`)),
    requestCert: true,
    rejectUnauthorized: false,
  }, web),
  websocket: https.createServer({
    key: fs.readFileSync(`${config.dir}/ssl-private-key.pem`),
    cert: fs.readFileSync(`${config.dir}/ssl-certificate.pem`),
    ca: fs.readdirSync(config.dir)
          .filter(f => /ssl-intermediate/.test(f))
          .map(f => fs.readFileSync(`${config.dir}/${f}`)),
  }),
};

// web checks for client certificate from expected CA

const issuer = x509.parseCert(`${config.dir}/ssl-ca.pem`).fingerPrint;

servers.web.on('secureConnection', function(connection) {
  if ( ! connection.authorized) { return; }
  let cert = connection.getPeerCertificate(true);
  if (cert.issuerCertificate.fingerprint !== issuer) {
    connection.authorized = false;
    connection.authorizationError = 'unexpected issuer';
  }
});

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
