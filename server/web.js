const bodyparser = require('body-parser');
const crypto = require('crypto');
const diff = require('diff');
const enchilada = require('enchilada');
const events = require('events');
const express = require('express');
const fs = require('fs');
const moment = require('moment');
const mongodb = require('mongodb');
const pug = require('pug');
const sharedb = require('sharedb')

const logger = require('./logger');

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
    res.render('dashboard/collabs', {
      project: req.params.project,
      cutoff: req.params.cutoff,
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
  
  app.get('/dashboard/:project/live/m/:milestone', authenticate, staffonly, function(req, res, next) {
    res.render('dashboard/pings', {
      project: req.params.project,
      milestone: req.params.milestone,
    });
  });
  
  app.get('/dashboard/:project/m/:milestone/:cutoff?', authenticate, staffonly, function(req, res, next) {
    res.render('dashboard/collabs', {
      project: req.params.project,
      milestone: req.params.milestone,
      cutoff: req.params.cutoff,
    });
  });
  
  app.get('/dashboard/:project/:collabid/:cutoff?', authenticate, staffonly, function(req, res, next) {
    res.render('dashboard/collab', {
      project: req.params.project,
      collabid: req.params.collabid,
      cutoff: req.params.cutoff,
    });
  });
  
  app.get('/dashboard/:project/:collabid/m/:milestone/:cutoff?', authenticate, staffonly, function(req, res, next) {
    res.render('dashboard/collab', {
      project: req.params.project,
      collabid: req.params.collabid,
      milestone: req.params.milestone,
      cutoff: req.params.cutoff,
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
  
  app.get('/historical/:project/:collabid/:filepath(*)/:cutoff', authenticate, authorize, function(req, res, next) {
    db.getHistorical(req.params.collabid, req.params.filepath, moment(req.params.cutoff), function(err, historical) {
      if (err) { return res.status(500).send({ code: err.code, message: err.message }); }
      res.setHeader('Cache-Control', 'max-age=3600');
      res.send(historical);
    });
  });

  app.get('/ops/:project/:collabid/:filepath(*)', authenticate, staffonly, function(req, res, next) {
    db.getOps(req.params.collabid, req.params.filepath, function(err, ops) {
      if (err) { return res.status(500).send({ code: err.code, message: err.message }); }
      var chunkedDiffs = getChunkedDiffs(ops);
      //var mergedDiffs = mergeDiffs(chunkedDiffs);
      testMergedDiffsAdd();
      //var chunkedDiffs = computeTotalDiff(ops);
      res.setHeader('Cache-Control', 'max-age=3600');
      res.send(chunkedDiffs);
      //res.send([chunkedDiffs, mergedDiffs]);
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

function getChunkedDiffs(ops) {
    var chunkedDiffs = [];
    var threshold = 100000; // TODO: Tune threshold
    // 2000 -> 89 diffs
    // 10000 -> 34 diffs
    // 100000 -> 6 diffs

    /* Setup the baseline of the document */ 
    var firstOp = ops[0];

    // The baseline for the next diff
    var currentBaseline = {v:0};
    sharedb.ot.apply(currentBaseline, firstOp);
    // The doc to apply ops to
    var currentDoc = {v:0};
    sharedb.ot.apply(currentDoc, firstOp);

    var lastTs = firstOp.m.ts;

    /* Apply each op, and calculate a diff if two 
       consecutive ops are far enough apart */
    for (var i = 1; i < ops.length; i++) {
      var op = ops[i];

      // Start a new chunk if necessary
      if (op.m.ts - lastTs > threshold) {
        var chunkedDiff = diff.diffLines(
          currentBaseline.data.text.trim(), currentDoc.data.text.trim());
        
        // Only push diffs with changes
        if (!(chunkedDiff.length == 1 && 
            !chunkedDiff[0].added &&
            !chunkedDiff[0].removed)) {
          chunkedDiffs.push(chunkedDiff);
        }

        // Make a deep copy
        currentBaseline = JSON.parse(JSON.stringify(currentDoc));
        
      }

      // Apply the op
      let err = sharedb.ot.apply(currentDoc, op);
      if (err) {
        // TODO: Better error handling
        console.log("err when applying op:" + JSON.stringify(err));
        return;
      }
         
      lastTs = op.m.ts;
    }

    return chunkedDiffs; 
}

// Merges multiple diffs into one diff with all
// additions and deletes kept.

// TODO: This seems much too complicated

// TODO: Remove parts with '' at the end

function mergeDiffs(diffs) {
  mergedDiff = JSON.parse(JSON.stringify(diffs[0]));
  for (var i = 1; i < diffs.length; i++) {
    var diff = JSON.parse(JSON.stringify(diffs[i]));

    // Index into mergedDiff for what chunk we're currently on
    var currentChunkInMerged = 0;

    // Index within the current chunk
    var indexInCurrentChunkInMerged = 0;

    diff.forEach(function(part) {
      if (part.added) {

        var currentChunk = mergedDiff[currentChunkInMerged];

        // Split up this chunk into previous and next
        var prevChunk = JSON.parse(JSON.stringify(currentChunk));
        prevChunk.value = prevChunk.value.substring(0, indexInCurrentChunkInMerged);
        var nextChunk = JSON.parse(JSON.stringify(currentChunk));
        nextChunk.value = nextChunk.value.substring(indexInCurrentChunkInMerged);

        // Delete the current chunk and replace it with prev, part, and next
        mergedDiff.splice(currentChunkInMerged, 1, prevChunk, part, nextChunk);

        // Now, we start at the beginning of nextChunk
        currentChunkInMerged += 2;
        indexInCurrentChunkInMerged = 0;     
        
      } else if (part.removed) {

        var currentChunk = mergedDiff[currentChunkInMerged];

        if (indexInCurrentChunkInMerged + part.value.length < currentChunk.value.length) {
          // The remove is within a single chunk
          var prevChunk = JSON.parse(JSON.stringify(currentChunk));
          prevChunk.value = prevChunk.value.substring(0, indexInCurrentChunkInMerged);
          var deletedChunk = JSON.parse(JSON.stringify(currentChunk));
          deletedChunk.value = deletedChunk.value.substring(indexInCurrentChunkInMerged, indexInCurrentChunkInMerged + part.value.length);
          deletedChunk.removed = true;
          deletedChunk.added = false;
          var nextChunk = JSON.parse(JSON.stringify(currentChunk));
          nextChunk.value = nextChunk.value.substring(indexInCurrentChunkInMerged + part.value.length);

          // Delete the current chunk and replace it
          mergedDiff.splice(currentChunkInMerged, 1, prevChunk, deletedChunk, nextChunk);

          // Starting at the beginning of nextChunk
          currentChunkInMerged += 2;
          indexInCurrentChunkInMerged = 0;

        } else {
          // The remove goes over multiple chunks

          // Split the first chunk into a normal part and deleted part
          var normalChunk = JSON.parse(JSON.stringify(currentChunk));
          normalChunk.value = normalChunk.value.substring(0, indexInCurrentChunkInMerged);
          var firstDeletedChunk = JSON.parse(JSON.stringify(currentChunk));
          firstDeletedChunk.value = firstDeletedChunk.value.substring(indexInCurrentChunkInMerged);
          firstDeletedChunk.removed = true;
          firstDeletedChunk.added = false;

          // TODO: Remove parts with '' value

          // Delete the current chunk and replace it with prev and next
          mergedDiff.splice(currentChunkInMerged, 1, normalChunk, firstDeletedChunk);

          // Start our while loop at the beginning of the next chunk
          currentChunkInMerged += 2;
          indexInCurrentChunkInMerged = 0;
          if (!mergedDiff[currentChunkInMerged]) {
            return;
          }

          var numSeenCharacters = 0;
          var numCharactersLeft = part.value.length - nextChunk.value.length;
          
          // Mark all chunks in the middle as removed
          // and find the chunk at the end that must be partially removed
          while (numSeenCharacters < numCharactersLeft) {
            var currentChunk = mergedDiff[currentChunkInMerged];
            if (currentChunk.removed) {
              // This chunk is not included this diff, so keep going
              currentChunkInMerged += 1;

            } else if (numSeenCharacters + currentChunk.value.length < numCharactersLeft) {
              // This whole chunk should be considered removed
              currentChunk.removed = true;
              currentChunk.added = false;
              numSeenCharacters = numSeenCharacters + currentChunk.value.length;
              currentChunkInMerged += 1;

            } else {
              // The last chunk is partly removed, partly not removed
              break;
            }
          }

          // Split last chunk, since remove might end
          // in the middle of a chunk
          currentChunk = mergedDiff[currentChunkInMerged];
          if (!currentChunk) {
            return;
          }
          
          // We have this many more characters to remove 
          numCharactersToDelete = numCharactersLeft - numSeenCharacters;

          var lastDeletedChunk = JSON.parse(JSON.stringify(currentChunk));
          lastDeletedChunk.value = lastDeletedChunk.value.substring(0, numCharactersToDelete);
          lastDeletedChunk.removed = true;
          lastDeletedChunk.added = false;
          var nextNormalChunk = JSON.parse(JSON.stringify(currentChunk));
          nextNormalChunk.value = nextNormalChunk.value.substring(numCharactersToDelete);


          // Delete the current chunk and replace it with prev and next
          mergedDiff.splice(currentChunkInMerged, 1, lastDeletedChunk, nextNormalChunk);

          // Start at the beginning of the normal chunk
          currentChunkInMerged += 1;
          indexInCurrentChunkInMerged = 0;

        }

        
      } else {
        // Part is not removed or added,
        // So we just need to change our currentChunkInMerged
        // and indexInCurrentChunkInMerged

        var currentChunk = mergedDiff[currentChunkInMerged];

        // Check if we stay in the same chunk after this part
        if (indexInCurrentChunkInMerged + part.value.length < currentChunk.value.length) {
          indexInCurrentChunkInMerged += part.value.length;
          return;
        }

        // Start out by going through the first chunk
        var numSeenCharacters = currentChunk.value.length - indexInCurrentChunkInMerged;
        var numCharactersLeft = part.value.length - numSeenCharacters;
        
        currentChunkInMerged += 1;
        currentChunk = mergedDiff[currentChunkInMerged];
    
        // Find the chunk at the end
        while (currentChunk && numSeenCharacters < numCharactersLeft) {
          if (currentChunk.removed) {
            // A removed chunk should not be counted, so keep going
            currentChunkInMerged += 1;

          } else if (numSeenCharacters + currentChunk.value.length < numCharactersLeft) {
            // We can go completely through this chunk,
            // so move on to next chunk
            numSeenCharacters = numSeenCharacters + currentChunk.value.length;
            currentChunkInMerged += 1;

          } else {
            // We can't go through a whole chunk
            break;
          }
          currentChunk = mergedDiff[currentChunkInMerged];
        }

        indexInCurrentChunkInMerged = part.value.length - numSeenCharacters;
      }
    });
  }

  return mergedDiff;
}

// Tests for bugs found when looking at real code
function testMergedDiffsRegression() {
  /* Testing newlines 
  diff_0 = [
    {'value': '    // TODO\n\n    // TODO'}
  ];

  diff_1 = [
    {'value': '    // TODO\n', 'removed': true},
    {'value': '\n    // TODO'}
  ]
  console.log(mergeDiffs([diff_0, diff_1])); */

  /* Duplicating test case */
  diff_0 = [
    {'value': '    // TODO\n    \n    //////\n'},
  ];

  diff_1 = [
    {'value': '    // TODO\n', 'removed': true},
    {'value': '\n    public Set<E> CharSet1() {\n        m\n    }\n', 'added': true},
    {'value': '    \n'},
    {'value': '    \n', 'added': true},
    {'value': '     //////\n'}
  ];

  diff_2 = [
    {'value': '\n    public Set<E> CharSet1() {\n'},
    {'value': '        m\n', 'removed': true},
    {'value': '       \n', 'added': true},
    {'value': '    }\n    \n    \n    //////\n'}
  ]

  /* Expect:
      // TODO\n---------------------removed
  \n--------------------------------added
      public Set<E> CharSet1() {\n--added
          m\n-----------------------added then removed(2)
         \n-------------------------added(2)
      }\n---------------------------added
      \n----------------------------same
      \n----------------------------added
      //////------------------------same   

  */

  /* Actual, after fixing bug#1 and #2 and only doing diff0 and 1:
[ { value: '' },
  { value: '    // TODO\n', removed: true, added: false },
  { value: '\n    ', added: true },
  { value: '    \n', added: true },
  { value: 'public Set<E> CharSet1() {\n        m\n    }\n',
    added: true },
  { value: '    \n    //////\n' } ]

  Differences:
    seems to have switched two of them?
  */

  console.log(mergeDiffs([diff_0, diff_1]));

  // Bug #2 minimized
  diff_0 = [
    {'value': 'something'}
  ];

  diff_1 = [
    {'value': 'some'},
    {'value': 'muchlongthing', 'added': true},
    {'value': 'th'},
    {'value': 'short', 'added': true},
    {'value': 'ing'}
  ];

  //console.log(mergeDiffs([diff_0, diff_1]));

  // Bug #1 minimized
  diff_0 = [
    {'value': '    // TODO\n    //////\n'},
  ];

  diff_1 = [
    {'value': '    // TODO\n', 'removed': true},
    {'value': 'something else', 'added': true},
    {'value': '    //////\n'}
  ];

  //console.log(mergeDiffs([diff_0, diff_1]));

  // Bug #1 more inimized version
  diff_0 = [
    {'value': 'something'}
  ];

  diff_1 = [
    {'value': 'som', 'removed': true},
    {'value': 'else', 'added': true},
    {'value': 'ething'}
  ];

  // console.log(mergeDiffs([diff_0, diff_1]));

}

function testMergedDiffsRemove() {
  console.log("start of testing remove");
  /* Remove exactly 1 chunk 
  diff_0 = [
    {'value': 'hello'},
    {'value': ' there', 'added': true},
  ]

  diff_1 = [
    {'value': 'hello'},
    {'value': ' there', 'removed': true},
  ]
  console.log(mergeDiffs([diff_0, diff_1]));
  

  /* Remove everything 
  diff_0 = [
    {'value': 'hello'},
    {'value': ' there', 'added': true},
  ]

  diff_1 = [
    {'value': 'hello there', 'removed': true},
  ]
  console.log(mergeDiffs([diff_0, diff_1]));
  

  /* Remove in the middle of two parts 
  diff_0 = [
    {'value': 'hello'},
    {'value': ' there', 'added': true},
  ]

  diff_1 = [
    {'value': 'hel'},
    {'value': 'lo th', 'removed': true},
    {'value': 'ere'},
  ]
  console.log(mergeDiffs([diff_0, diff_1]));

  /* Remove over many complete parts 
  diff_0 = [
    {'value': 'hello'},
    {'value': ' there', 'added': true},
    {'value': ' Constellation'},
    {'value': '. you are', 'added': true},
    {'value': 'cool.', 'added': true}
  ]

  diff_1 = [
    {'value': 'hello'},
    {'value': ' there Constellation. you are', 'removed': true},
    {'value': 'cool.'},
  ]
  console.log(mergeDiffs([diff_0, diff_1])); */

  /* Remove part of 1 chunk 
  diff_0 = [
    {'value': 'something'}
  ];

  diff_1 = [
    {'value': 'so'},
    {'value': 'met', 'removed': true},
    {'value': 'hing'},
  ];
  console.log(mergeDiffs([diff_0, diff_1])); */

  /* Remove with a remove in the middle of previous diff 
  diff_0 = [
    {'value': 'something'}
  ];

  diff_1 = [
    {'value': 'so'},
    {'value': 'met', 'removed': true},
    {'value': 'hing'},
  ];
  diff_2 = [
    {'value': 's'},
    {'value': 'hi', 'removed': true},
    {'value': 'ng'}
  ]
  console.log(mergeDiffs([diff_0, diff_1, diff_2])); */

  /* Multiple removes in diff_1 
  diff_0 = [
    {'value': 'something xxx yyy'}
  ];

  diff_1 = [
    {'value': 'so', 'removed': true},
    {'value': 'mething xx'},
    {'value': 'x yy', 'removed': true},
    {'value': 'y'},
  ];
  console.log(mergeDiffs([diff_0, diff_1])); */

}

function testMergedDiffsAdd() {
  /** Adding at the end */

  diff_0 = [
    {'value': 'hello'},
    {'value': ' there', 'added': true},
  ]

  diff_1 = [
    {'value': 'hello there'},
    {'value': ' again', 'added': true},
  ]
  console.log("expect:hello=same, there=added, again=added");
  console.log(mergeDiffs([diff_0, diff_1]));


  /** Adding at the very beginning  */

  diff_0 = [
    {'value': 'hello'},
    {'value': ' there', 'added': true},
  ]

  diff_1 = [
    {'value': 'why ', 'added': true},
    {'value': 'hello there'},
  ]
  console.log("expect:why =added,hello=same, there=added");
  console.log(mergeDiffs([diff_0, diff_1]));
 

 /* Adding at beginning of a chunk in the middle */
  diff_0 = [
    {'value': 'hello'},
    {'value': ' there', 'added': true},
  ]

  diff_1 = [
    {'value': 'hello'},
    {'value': 'xxxx', 'added': true},
    {'value': ' there'},
  ]
  console.log('expect:hello=same,xxxx=added, there=added');
  console.log(mergeDiffs([diff_0, diff_1]));


  /** Adding in the middle of a chunk */
  diff_0 = [
    {'value': 'hello'},
    {'value': ' there', 'added': true},
  ]

  diff_1 = [
    {'value': 'hello th'},
    {'value': 'xxxx', 'added': true},
    {'value': 'ere'},
  ]
  console.log('expect:hello=same, th=added,xxxx=added,ere=added');
  console.log(mergeDiffs([diff_0, diff_1]));

  /** Adding to a diff with removed parts  */
  diff_0 = [
    {'value': 'hello there'},
  ]
  diff_1 = [
    {'value': 'he'},
    {'value': 'llo the', 'removed': true},
    {'value': 're'},
  ]
  diff_2 = [
    {'value': 'h'},
    {'value': 'something', 'added': true},
    {'value': 'ere'}
  ]
  // Expectation is undetermined based on spec
  console.log('expect:h=same,something=added,e=same,llo the=removed,re=same')
  console.log(mergeDiffs([diff_0, diff_1, diff_2]));

  /** Used to test if currentChunkInMerged,
    indexInCurrentChunkInMerged are correct 
  diff_0 = [
    {'value': 'abc'},
    {'value': 'lmnop'},
    {'value': 'xyz'}
  ];

  diff_1 = [
    {'value': 'abclm'},
    {'value': 'no'},
    {'value': 'pxyz'}
  ];
  console.log(mergeDiffs([diff_0, diff_1]));
  */
}


// TODO: Consistently killing mongo when trying to run
// TODO: Takes forever to run
function computeTotalDiff(ops) {
  console.log("computing total diff");
  var totalDiff = [];

  /* Setup the baseline of the document */ 
  var firstOp = ops[0];
  var firstText = firstOp.create.data.text;
  firstText.split('').forEach(function(char) {
    totalDiff.push({'char': char, 'type': 'b'}); // b = baseline
  });

  for (var i = 1; i < ops.length; i++) {
    op = ops[i];

    var opText = getOpText(op);
    if (opText) {
      if (opText.type == 'insert') {
        var textArray = [];
        opText.text.forEach(function(char) {
          textArray.push({'char': char, 'type': 's'}); // s = student
        });

        // TODO: This has to ignore indices
        //   of deleted code
        totalDiff.splice(opText.index, /* deleteCount */ 0,
          ... textArray);
      } else if (opText.type == 'delete') {
        
        for (var i = opText.index; i < opText.index + opText.text.length; i++) {
          var prev = totalDiff[i];
          // TODO: Assert that it's an 's' or 'b'
          totalDiff[i] = {'char': prev.char, 'type': prev.type + 'd'};
            // sd = student-written code that was deleted
            // bd = baseline code that was deleted
        }
      }
    }

  }
  console.log(totalDiff);

  return totalDiff;
}

function getOpText(op) {
  var textOrCurors = op.op[0].p[0];
  if (textOrCurors == 'text') {
    // Get type
    var type;
    var text;
    if (op.op[0].sd) {
      type = 'delete';
      text = op.op[0].sd;
    } else if (op.op[0].si) {
      type = 'insert';
      text = op.op[0].si;
    }

    if (text) {
      return {
        'index': op.op[0].p[1],
        'type': type,
        'text': text.split('')
      }
    }    
  }

  return null;
}