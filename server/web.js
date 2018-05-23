const bodyparser = require('body-parser');
const crypto = require('crypto');
const enchilada = require('enchilada');
const events = require('events');
const express = require('express');
const fs = require('fs');
const moment = require('moment');
const mongodb = require('mongodb');
const pug = require('pug');
const child_process = require('child_process');

const logger = require('./logger');
const diffing = require('./diffing');

exports.createFrontend = function createFrontend(config, db) {
  
  const log = logger.log.child({ in: 'app' });

  const join = require('./join').create(config);
  const paired = new events.EventEmitter();
  const setupproject = 'constellation-setup';
  
  const app = express();
  
  app.set('view engine', 'pug');
  app.set('views', `${__dirname}/views`);
  app.set('x-powered-by', false);
  
  app.use('/public', enchilada(`${__dirname}/public`));
  app.use('/static', express.static(`${__dirname}/static`));
  app.use(bodyparser.json());

  app.use(logger.express(log));
  
  app.locals.config = config;
  app.locals.moment = moment;
  
  // validate parameter against anchored regex
  function validate(regex) {
    let anchored = new RegExp('^' + regex.source + '$');
    return function(req, res, next, val) {
      if (anchored.test(val)) { next(); } else { next('route'); }
    };
  }
  
  app.param('project', validate(/[\w-]+/));
  app.param('userid', validate(/\w+/));
  app.param('collabid', validate(/[0-9a-f]{24}/));
  app.param('milestone', validate(/\w+/));
  app.param('cutoff', validate(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/));
  
  function authenticate(req, res, next) {
    let cert = req.connection.getPeerCertificate();
    if ( ! req.connection.authorized) {
      return res.status(401).render('401', {
        error: req.connection.authorizationError,
        cert
      });
    }
    
    res.locals.authusername = cert.subject.emailAddress.replace('@' + config.web.certDomain, '');
    if (config.web.userFakery) {
      res.locals.authusername += '+' +
        crypto.createHash('md5').update(req.headers['user-agent']).digest('hex').substr(0, 3);
    }
    res.locals.authstaff = config.staff.indexOf(res.locals.authusername) >= 0;
    res.set('X-Authenticated-User', res.locals.authusername);
    
    res.locals.shareURL = `wss://${req.hostname}:${config.web.wss}/${db.usernameToken(res.locals.authusername)}`;
    
    next();
  }
  
  function collaboration(req, res, next) {
    db.getUser(res.locals.authusername, function(err, user) {
      res.locals.collabid = user.data && user.data.collabs.length && user.data.collabs[0];
      next();
    });
  }
  
  function staffonly(req, res, next) {
    if ( ! res.locals.authstaff) {
      return res.status(401).render('401', { error: 'Permission denied' });
    }
    next();
  }
  
  function authorize(req, res, next) {
    if (res.locals.authstaff) { return next(); }
    db.getCollab(req.params.collabid, function(err, collab) {
      if (err || collab.data.users.indexOf(res.locals.authusername) < 0) {
        return res.status(401).render('401', { error: 'Permission denied' });
      }
      next();
    });
  }
  
  app.get('/', authenticate, collaboration, function(req, res, next) {
    res.render('index');
  });
  
  app.get('/pair/:project/:id', authenticate, function(req, res, next) {
    if (req.params.project == setupproject) {
      return res.render('setup-join');
    }
    
    res.render('join', {
      project: req.params.project,
      joincode: join.code({ username: res.locals.authusername, project: req.params.project }),
    });
  });
  
  app.post('/pair/:project/:userid', authenticate, function(req, res, next) {
    let me = res.locals.authusername;
    let token = db.usernameToken(res.locals.authusername);
    
    if (req.params.project == setupproject) {
      db.recordSetup(me, function(err) {
        if (err) { log.warn({ err }, 'Error recording user setup'); }
      });
      paired.emit(req.params.userid, { me, token });
      return res.send({ redirect: '/setup-done' });
    }

    join.rendezvous(req.body.me, req.body.partner, function(err, agreed) {
      if (err) { return res.status(400).send({ error: err.message }); }
      
      if (res.locals.authusername == agreed.partner.username) {
        return res.status(400).send({ error: 'Cannot pair with yourself' });
      }
      if (agreed.me.project !== agreed.partner.project) {
        return res.status(400).send({ error: 'Different projects selected' });
      }
      
      let partner = agreed.partner.username;
      let project = agreed.me.project;
      let collabid = agreed.id;
      db.addUserToCollaboration(me, project, collabid, function(err) {
        paired.emit(req.params.userid, { me, token, partner, project, collabid });
        res.send({ redirect: '/edit' });
      });
    });
  });

  app.get('/setup-done', authenticate, function(req, res, next) {
    res.render('setup-done');
  });
  
  app.get('/edit', authenticate, collaboration, function(req, res, next) {
    if ( ! res.locals.collabid) {
      return res.status(400).render('400', { error: 'No current collaboration' });
    }
    res.render('files');
  });
  
  app.get('/edit/:filepath(*)', authenticate, collaboration, function(req, res, next) {
    if ( ! res.locals.collabid) {
      return res.status(400).render('400', { error: 'No current collaboration' });
    }
    res.render('edit', {
      filepath: req.params.filepath,
    });
  });
  
  app.get('/show/:project/:collabid/:cutoff', authenticate, function(req, res, next) {
    res.render('collab', {
      project: req.params.project,
      collabid: req.params.collabid,
      cutoff: req.params.cutoff,
    });
  });
  
  app.get('/show/:project/:collabid/m/:milestone', authenticate, function(req, res, next) {
    res.render('collab', {
      project: req.params.project,
      collabid: req.params.collabid,
      milestone: req.params.milestone,
    });
  });
  
  app.get('/dashboard', authenticate, staffonly, function(req, res, next) {
    db.getProjects(function(err, projects) {
      res.render('dashboard/projects', {
        projects,
      });
    });
  });
  
  app.get('/dashboard/:project/:cutoff?', authenticate, staffonly, function(req, res, next) {
    if (req.params.project == setupproject) {
      return db.getSetups(req.params.cutoff, function(err, setups) {
        if (err) { return res.status(400).send({ error: err.message }); }
        res.attachment('constellation-setups.csv');
        res.render('dashboard/setups-csv', { setups });
      });
    }

    res.render('dashboard/collabs', {
      project: req.params.project,
      cutoff: req.params.cutoff,
      deletedCode: req.query.deletedCode,
      regexes: req.query.regexes,
      hideCommonPrefix: req.query.hideCommonPrefix,
    });
  });
  
  app.get('/dashboard/:project/checkoffs:csv(.csv)?', authenticate, staffonly, function(req, res, next) {
    db.getCheckoffs(req.params.project, function(err, milestones, users) {
      if (req.params.csv) {
        res.attachment(`constellation-checkoffs-${req.params.project}.csv`);
        res.locals.url = `https://${req.hostname}${config.web.https != 443 ? `:${config.web.https}` : ''}`;
      }
      res.render(req.params.csv ? 'dashboard/checkoffs-csv' : 'dashboard/checkoffs', {
        project: req.params.project,
        milestones,
        users,
      });
    });
  });

  app.get('/dashboard/:project/live', authenticate, staffonly, function(req, res, next) {
    res.render('dashboard/live', {
      project: req.params.project
    });
  });
  
  app.get('/dashboard/:project/live/m/:milestone', authenticate, staffonly, function(req, res, next) {
    res.render('dashboard/pings', {
      project: req.params.project,
      milestone: req.params.milestone,
    });
  });
  
  app.get('/dashboard/:project/m/:milestone/:cutoff?/:regexes?', authenticate, staffonly, function(req, res, next) {

    res.render('dashboard/collabs', {
      project: req.params.project,
      milestone: req.params.milestone,
      cutoff: req.params.cutoff,
      deletedCode: req.query.deletedCode,
      regexes: req.query.regexes,
      hideCommonPrefix: req.query.hideCommonPrefix,    
    });
  });
  
  app.get('/dashboard/:project/:collabid/:cutoff?', authenticate, staffonly, function(req, res, next) {
    res.render('dashboard/collab', {
      project: req.params.project,
      collabid: req.params.collabid,
      cutoff: req.params.cutoff,
      deletedCode: req.query.deletedCode,
      regexes: req.query.regexes,
      hideCommonPrefix: req.query.hideCommonPrefix,
    });
  });
  
  // TODO: Get URL with regex but no cutoff to work
  app.get('/dashboard/:project/:collabid/m/:milestone/:cutoff?/:regexes?', authenticate, staffonly, function(req, res, next) {
    res.render('dashboard/collab', {
      project: req.params.project,
      collabid: req.params.collabid,
      milestone: req.params.milestone,
      cutoff: req.params.cutoff,
      deletedCode: req.query.deletedCode,
      regexes: req.query.regexes,
      hideCommonPrefix: req.query.hideCommonPrefix,
    });
  });
  
  app.get('/baseline/:project/:filepath(*)', authenticate, staffonly, function(req, res, next) {
    
    db.getBaseline(req.params.project, req.params.filepath, function(err, baseline) {
      if (err) { return res.status(500).send({ code: err.code, message: err.message }); }
      res.type('text/plain');
      res.setHeader('Cache-Control', 'max-age=3600');
      res.send(baseline);
    });
  });

  // Find the given regex in the text, using fuzzy matching
  // TODO: Better URL?
  app.get('/regex/:collabid/:regexes/:cutoff?/f/:filepath(*)', authenticate, staffonly,  function(req, res, next) {
    if (req.params.cutoff) {
      db.getHistorical(req.params.collabid, req.params.filepath, moment(req.params.cutoff), function(err, historical) {
        if (err) { return res.status(500).send({ code: err.code, message: err.message }); }
        var regexesMap = getRegexesMap(historical.data.text, req.params.regexes);
        res.send(JSON.stringify([...regexesMap]));
      });
    } else {
      db.getFile(req.params.collabid, req.params.filepath, function(err, file) {
        if (err) { return res.status(500).send({ code: err.code, message: err.message }); }
        var regexesMap = getRegexesMap(file.text, req.params.regexes);
        res.send(JSON.stringify([...regexesMap]));
      });
    }
  });

  app.post('/regex/:regexes', authenticate, staffonly, function(req, res, next) {
    var text = req.body.text;
    var regexesMap = getRegexesMap(text, req.params.regexes);
    res.send(JSON.stringify([...regexesMap]));
  });

  
  app.get('/historical/:project/:collabid/:filepath(*)/:cutoff', authenticate, authorize, function(req, res, next) {
    db.getHistorical(req.params.collabid, req.params.filepath, moment(req.params.cutoff), function(err, historical) {
      if (err) { return res.status(500).send({ code: err.code, message: err.message }); }
      res.setHeader('Cache-Control', 'max-age=3600');
      res.send(historical);
    });
  });

  // TODO: Better way to take in the cutoff than as a '?cutoff='' ?
  app.get('/ops/:project/:collabid/:filepath(*)', authenticate, staffonly, function(req, res, next) {
    db.getOps(req.params.collabid, req.params.filepath, req.query.cutoff, function(err, ops) {
      if (err) { return res.status(500).send({ code: err.code, message: err.message }); }

      if (ops.length == 0) {
        res.setHeader('Cache-Control', 'max-age=3600');
        res.send([]);
      }

      db.getBaseline(req.params.project, req.params.filepath, function(err, baseline) {
        if (err) { return res.status(500).send({ code: err.code, message: err.message }); }
        diffing.convertOpsIntoDiffs(ops, baseline, function(err, diffs) {
          if (err) { return res.status(500).send({ code: err.code, message: err.message }); }
          var flatDiff = diffing.flattenDiffs(diffs);
          res.setHeader('Cache-Control', 'max-age=3600');
          res.send(flatDiff);
        });
      });
    });
  })
  
  app.get('/hello/:version', function(req, res, next) {
    getPluginVersion(function(err, version) {
      res.send({
        update: req.params.version < version ? version : undefined,
        userid: mongodb.ObjectID().toString(),
      });
    });
  });
  
  app.get('/await-collaboration/:userid', function(req, res, next) {
    let send = settings => res.send(settings);
    paired.once(req.params.userid, send);
    setTimeout(() => paired.removeListener(req.params.userid, send), 1000 * 60 * 15);
  });
  
  app.get('/install', function(req, res, next) {
    getPluginVersion(function(err, version) {
      if (err) {
        return res.status(400).render('400', { error: 'Install server not configured' });
      }
      let protocol = config.web.httpUpdateSite ? 'http' : 'https';
      let port = config.web.httpUpdateSite ? `:${config.web.httpUpdateSite}`
                                           : config.web.https != 443 ? `:${config.web.https}` : '';
      res.render('install', {
        version,
        url: `${protocol}://${req.hostname}${port}${req.path}`
      });
    });
  });
  
  app.use('/install', express.static(`${__dirname}/install`));
  
  app.createUpdateSite = function createUpdateSite() {
    const app = express();
    app.use('/install', express.static(`${__dirname}/install`));
    return app;
  };
  
  app.get('/update/:oldversion', function(req, res, next) {
    getPluginVersion(function(err, version) {
      if (err) {
        return res.status(400).render('400', { error: 'Install server not configured' });
      }
      res.render('update', {
        oldversion: req.params.oldversion.split('.', 3).join('.'),
        version,
      });
    });
  });
  
  app.get('*', function(req, res, next) {
    res.status(404).render('404');
  });
  
  return app;
};

// get the plug-in version without qualifier
function getPluginVersion(callback) {
  fs.readFile(`${__dirname}/install/version.txt`, { encoding: 'utf8' }, function(err, version) {
    callback(err, version && version.trim().split('.', 3).join('.'));
  });
}

function getRegexesMap(fileText, regexes) {
  // Regex matching: https://laurikari.net/tre/about/
  // TODO: Add 'apt-get install tre-agrep libtre5 libtre-dev'
  //   to a setup script somewhere?

  var regexesMap = new Map();

  // tre-agrep doesn't require that you only give it one line at a time
  // However, tre-agrep only finds the first instance of regex in each line,
  //   and we want to find all instances of each regex in each line.
  // So, we split the file by line and find multiple regexes (if they exist)
  //   for each line individually.
  var fileLines = fileText.split("\n");
  var regexesList = regexes.split(";;");

  for (let lineNumber = 1; lineNumber < fileLines.length + 1; lineNumber++) {
    // ';;' is the delimiter between regexes
    regexesList.forEach(function(regex) {
      if (regex.length > 0) {

        // Keeps track of what part of the line we start at, since if we're finding
        // multiple of the same regex in the same line, we need to cut off the first
        //   part of the line
        var indexInLine = 0;

        while (indexInLine < fileLines[lineNumber-1].length) {

          var result = child_process.spawnSync('tre-agrep',
            ['--show-position', '--line-number', '--regexp', regex, '-'],
            {'input': fileLines[lineNumber - 1].substring(indexInLine)}
          );

          var mapValue = getRegexLocationAndLength(result.stdout);
          if (mapValue) {
            // Then we got a regex match

            // Its actual indexInLine from the start of the entire line
            //   depends on where our substring started (indexInLine)
            mapValue["indexInLine"] = indexInLine + mapValue["indexInLine"];
            // Start the next substring from where this regex ends
            indexInLine = mapValue["indexInLine"] + mapValue["length"];

            if (regexesMap.has(lineNumber)) {
              regexesMap.set(lineNumber, regexesMap.get(lineNumber).concat([mapValue]));
            } else {
              regexesMap.set(lineNumber, [mapValue]);
            }  
          } else {
            // If no mapValue, there are no more regexes on this line
            // so we're done with the while loop
            break;
          }


        }

        
      }
    });
  }

  return regexesMap;
}

/** Get the location within a line and length of a regex match,
 * given the result of a tre-agrep call */
function getRegexLocationAndLength(stdout) {
  if (!stdout) {
    return;
  }

  // stdout returns ASCII numbers, so convert them to strings
  var resultString = stdout.toString('utf8');

  var values = resultString.split(':');
  if (values.length < 3) {
    // Not a legitimate match
    return;
  }

  var lineNumber = parseInt(values[0]);
  var relevantChars = values[1];
  var indices = relevantChars.split('-');
  var indexInLine = parseInt(indices[0]);
  // Note: If *, only includes the len of things before the *
  //   haven't tested if you have abc*xyz as the regex yet
  var lengthToHighlight = parseInt(indices[1]) - parseInt(indices[0]);

  var mapValue = {
    'indexInLine': indexInLine,
    'length': lengthToHighlight
  };

  return mapValue;
}
