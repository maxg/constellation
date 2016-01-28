var bodyparser = require('body-parser');
var crypto = require('crypto');
var express = require('express');
var events = require('events');
var fs = require('fs');
var http = require('http');
var https = require('https');
var jade = require('jade');
var mongodb = require('mongodb');
var sharejs = require('share');
var stream = require('stream');
var ws = require('ws');
var x509 = require('x509');

var config = require('./config');
var join = require('./join');

/* backend */

var db = require('./db').createBackend();

db.backend.queryFetch('collabs', {}, {}, function(err, results) {
  if (err) { throw err; }
  console.log('database connected', { collabs: results.length });
});

var share = sharejs.server.createClient({ backend: db.backend });

var paired = new events.EventEmitter();

/* web server */

var app = express();

app.set('view engine', 'jade');

app.use('/static/share', express.static(sharejs.scriptsDir));
app.use('/static', express.static(__dirname + '/static'));
app.use(bodyparser.json());

function authenticate(req, res, next) {
  var cert = req.connection.getPeerCertificate(true);
  if ( ! req.connection.authorized) {
    return res.status(401).render('401', {
      error: req.connection.authorizationError,
      cert: cert
    });
  }
  if (cert.issuerCertificate.fingerprint !== issuer) {
    return res.status(401).render('401', {
      error: 'unexpected issuer',
      cert: cert
    });
  }
  
  res.locals.authusername = cert.subject.emailAddress.replace('@' + config.web.certDomain, '');
  if (config.web.userFakery) {
    res.locals.authusername += '+' +
      crypto.createHash('md5').update(req.headers['user-agent']).digest('hex').substr(0,3);
  }
  res.locals.authstaff = config.staff.indexOf(res.locals.authusername) >= 0;
  
  res.locals.shareURL = 'wss://' + req.hostname + ':' + config.web.share;
  next();
}

function collaboration(req, res, next) {
  db.fetchUser(res.locals.authusername, function(err, snapshot) {
    res.locals.collabid = snapshot
                          && snapshot.data
                          && snapshot.data.collabids.length
                          && snapshot.data.collabids[0];
    next();
  });
}

app.get('/', authenticate, collaboration, function(req, res, next) {
  var port = config.web.http == 80 ? '' : ':' + config.web.http;
  res.render('index', {
    install: 'http://' + req.hostname + port + '/install'
  });
});

app.get('/userid/:version', function(req, res, next) {
  if (req.params.version == config.version) {
    res.send({ userid: mongodb.ObjectID().toString() });
  } else {
    res.send({ userid: 'Out-of-date'});
  }
});

app.get('/update/:version', function(req, res, next) {
  res.render('update', {
    version: req.params.version,
  });
});

app.get('/pair/:project/:id', authenticate, function(req, res, next) {
  res.render('join', {
    project: req.params.project,
    joincode: join.code({ username: res.locals.authusername, project: req.params.project })
  });
});

app.post('/pair/:project/:id', authenticate, function(req, res, next) {
  join.rendezvous(req.body.me, req.body.partner, function(err, collab) {
    if (err) { return res.status(400).send({ error: err.message }); }
    
    if (res.locals.authusername == collab.partner.username) {
      return res.status(400).send({ error: 'Cannot pair with yourself' });
    }
    if (collab.me.project != collab.partner.project) {
      return res.status(400).send({ error: 'Different projects selected' });
    }
    
    paired.emit(req.params.id, collab.id);
    
    db.addUserToCollaboration(res.locals.authusername, req.params.project, collab.id, function(err) {
      res.send({ redirect: '/files' });
    });
  });
});

app.get('/collab/:project/:userid', function(req, res, next) {
  var send = function(collabid) {
    res.send({ collabid: collabid });
  };
  paired.once(req.params.userid, send);
  setTimeout(function() {
    paired.removeListener(req.params.userid, send);
  }, 1000 * 60 * 15);
});

app.get('/files', authenticate, collaboration, function(req, res, next) {
  if ( ! res.locals.collabid) {
    return res.status(400).render('400', { error: 'No current collaboration' });
  }
  res.render('files');
});

app.get('/edit/:name', authenticate, collaboration, function(req, res, next) {
  if ( ! res.locals.collabid) {
    return res.status(400).render('400', { error: 'No current collaboration' });
  }
  res.render('edit', {
    name: req.params.name
  });
});

var webserver = https.createServer({
  key: config.readConfFileSync('ssl-private-key.pem'),
  cert: config.readConfFileSync('ssl-certificate.pem'),
  ca: config.listConfFilesSync(/ssl-(ca|intermediate).*.pem/).map(config.readConfFileSync),
  requestCert: true
}, app);
var issuer = x509.parseCert(config.readConfFileSync('ssl-ca.pem')).fingerPrint;

webserver.listen(config.web.https, function() {
  console.log('web server listening on', webserver.address());
});

/* share server */

share.filter(function(collection, doc, data, next) {
  if ([ 'users' ].indexOf(collection) >= 0) { return next('Access denied'); }
  next();
});

var wsserver = https.createServer({
  key: config.readConfFileSync('ssl-private-key.pem'),
  cert: config.readConfFileSync('ssl-certificate.pem'),
  ca: config.listConfFilesSync(/ssl-intermediate.*.pem/).map(config.readConfFileSync),
});

new ws.Server({ server: wsserver }).on('connection', function(sock) {
  var strm = new stream.Duplex({ objectMode: true });
  strm._write = function(chunk, encoding, cb) {
    if (sock.readyState != ws.CLOSED) { sock.send(JSON.stringify(chunk)); }
    return cb();
  };
  strm._read = function() {};
  sock.on('message', function(data) {
    try { strm.push(JSON.parse(data)); } catch (e) { console.error('invalid message', data); }
  });
  sock.on('close', function(code) {
    strm.push(null);
    strm.emit('close');
  });
  
  share.listen(strm);
});

wsserver.listen(config.web.share, function() {
  console.log('websocket server listening on', wsserver.address());
});

/* update site server */

var update = express();

update.set('view engine', 'jade');

update.use('/static', express.static(__dirname + '/static'));

update.get('/install', function(req, res, next) {
  fs.readdir(__dirname + '/install', function(err, files) {
    if ( ! files.some(function(name) { return /.*\.xml/.test(name); })) {
      return res.render('400', { error: 'Install server not configured' });
    }
    var port = config.web.http == 80 ? '' : ':' + config.web.http;
    res.render('install', { url: 'http://' + req.hostname + port + req.path });
  });
});
update.use('/install', express.static(__dirname + '/install'))
update.use('/install', function(req, res, next) {
  res.status(404).send('Not found');
});

update.get('*', function(req, res, next) {
  console.log('redirecting', req.path);
  if ( ! req.headers.host) {
    return res.status(400).send('Bad request: missing host');
  }
  var port = config.web.https == 443 ? '' : ':' + config.web.https;
  res.redirect('https://' + req.hostname + port + req.path);
});

var updateserver = http.createServer(update);

updateserver.listen(config.web.http, function() {
  console.log('install server listening on', updateserver.address());
});
