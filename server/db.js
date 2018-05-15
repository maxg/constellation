const async = require('async');
const crypto = require('crypto');
const mongodb = require('mongodb');
const sharedb = require('sharedb');
const moment = require('moment');

const logger = require('./logger');

const COLLABS = 'collabs';
const USERS = 'users';
const FILES = 'files';
const CHECKOFFS = 'checkoffs';
const PINGS = 'pings';
const SETUP = 'setup';

exports.createBackend = function createBackend(config) {
  
  const log = logger.log.child({ in: 'db' });
  
  const db = require('sharedb-mongo')(config.mongodb);
  const share = new sharedb({ db });
  
  let connection = share.connect();
  
  const authorize = { read: {}, write: {}, query: {} };
  
  // users can read/write collabs they have already been added to
  authorize.read[COLLABS] = authorize.write[COLLABS] = function(req, cb) {
    return req.snapshot.data.users.indexOf(req.agent.authusername) >= 0 ? cb() : deny(req, cb);
  };
  // users can read/write files and read checkoffs for their collabs
  // since authorizing requires looking up the collab, cache the result in the agent
  authorize.read[FILES] = authorize.write[FILES] = authorize.read[CHECKOFFS] = function(req, cb) {
    let collabid = req.id.split('-')[0];
    if (req.agent.custom.hasOwnProperty(collabid)) {
      return req.agent.custom[collabid] ? cb() : deny(req, cb);
    }
    let collab = connection.get(COLLABS, collabid);
    collab.fetch(function(err) {
      req.agent.custom[collabid] = ( ! err) && collab.data.users.indexOf(req.agent.authusername) >= 0;
      authorize.read[FILES](req, cb);
    });
  };
  // users can query for files in a collab (authorization above applies to results)
  authorize.query[FILES] = function(req, cb) {
    return req.query.collabid ? cb() : deny(req, cb);
  };
  
  function deny(req, cb) {
    log.error({
      user: req.agent.authusername, collection: req.collection, id: req.id, query: req.query
    }, 'db access denied');
    cb('403 Forbidden');
  }
  
  share.use('connect', function(req, cb) {
    if ( ! req.agent.stream.authusername) {
      return cb('401 Unauthorized');
    }
    req.agent.authusername = req.agent.stream.authusername;
    req.agent.authstaff = config.staff.indexOf(req.agent.authusername) >= 0;
    cb();
  });
  share.use('doc', function(req, cb) {
    if (req.agent.stream.isServer || req.agent.authstaff) { return cb(); }
    (authorize.read[req.collection] || deny)(req, cb);
  });
  share.use('commit', function(req, cb) {
    if (req.agent.stream.isServer || req.agent.authstaff) { return cb(); }
    (authorize.write[req.collection] || deny)(req, cb);
  });
  share.use('query', function(req, cb) {
    if (req.agent.stream.isServer || req.agent.authstaff) { return cb(); }
    (authorize.query[req.collection] || deny)(req, cb);
  });
  
  let backend = {
    share,
    
    // get signed username token
    usernameToken(username) {
      let hmac = crypto.createHmac('sha256', config.web.secret).update(username).digest('hex');
      return username + ':' + hmac;
    },
    
    // verify signed username token
    tokenUsername(token) {
      let username = token.split(':')[0];
      return token === backend.usernameToken(username) ? username : undefined;
    },

    // record a user setup
    recordSetup(username, callback) {
      db.getCollection(SETUP, function(err, setup) {
        if (err) { return callback(err); }
        setup.insert({ username, time: +new Date() }, callback);
      });
    },

    // get all user setups
    getSetups(since, callback) {
      db.getCollection(SETUP, function(err, setup) {
        if (err) { return callback(err); }
        let query = since
                    ? { time : { $gte: +new Date(since) } }
                    : {}
        setup.find(query).toArray(function(err, result) {
          callback(err, result);
        });
      });
    },
    
    // fetch all project names
    getProjects(callback) {
      db.getCollection(COLLABS, function(err, collabs) {
        if (err) { return callback(err); }
        collabs.aggregate([
          { $group: { _id: '$project', count: { $sum: 1 } } },
          { $sort : { _id: 1 } },
        ], callback);
      });
    },
    
    // fetch user object
    getUser(username, callback) {
      let user = connection.get(USERS, username);
      user.fetch(err => callback(err, user));
    },
    
    getCollab(collabid, callback) {
      let collab = connection.get(COLLABS, collabid);
      collab.fetch(err => callback(err, collab));
    },
    
    // add user to collaboration, and set their active collaboration
    addUserToCollaboration(username, project, collabid, callback) {
      async.autoInject({
        collab(done) {
          let collab = connection.get(COLLABS, collabid);
          collab.fetch(err => done(err, collab));
        },
        collab_created(collab, done) {
          if ( ! collab.type) {
            collab.create({ [USERS]: [], project }, done);
          } else { done(); }
        },
        user(done) {
          let user = connection.get(USERS, username);
          user.fetch(err => done(err, user));
        },
        user_created(user, done) {
          if ( ! user.type) {
            user.create({ [COLLABS]: [] }, done);
          } else { done(); }
        },
        add(collab, collab_created, done) {
          collab.submitOp([ { p: [ USERS, 0 ], li: username } ], done);
        },
        active(user, user_created, done) {
          user.submitOp([ { p: [ COLLABS, 0 ], li: collabid } ], done);
        },
      }, callback);
    },
    
    getCheckoffs(project, callback) {
      db.getCollection(CHECKOFFS, function(err, checkoffs) {
        if (err) { return callback(err); }
        async.parallel([
          done => checkoffs.aggregate([
            { $match: { project } },
            { $group: { _id: '$milestone', at: { $min: '$cutoff' } } },
            { $sort: { at: 1, _id: 1 } },
          ], done),
          done => checkoffs.aggregate([
            { $match: { project } },
            { $lookup: { from: 'collabs', localField: 'collabid', foreignField: '_id',
                         as: 'collab' } },
            { $unwind: '$collab' },
            { $project: { collabid: 1, project: 1, milestone: 1,
                          cutoff: 1, modified: 1, grader: 1, comment: 1, score: 1,
                          users: '$collab.users' } },
            { $unwind: '$users' },
            { $sort: { score: -1 } },
            { $group: { _id: { user: '$users', milestone: '$milestone' },
                        checkoff: { $first: '$$ROOT' } } },
            { $group: { _id: '$_id.user', checkoffs: { $push: '$checkoff' } } },
            { $sort: { _id: 1 } },
          ], done),
        ], (err, [ milestones, users ]) => callback(err, milestones, users));
      });
    },
    
    // get most common initial text for a file
    getBaseline(project, filepath, callback) {
      db.getDbs(function(err, mongo) {
        if (err) { return callback(err); }
        mongo.collection('o_'+FILES).aggregate([
          { $match: {
            'create.data.project': project,
            'create.data.filepath': filepath,
          } },
          { $project: { text: '$create.data.text' } },
          { $group: { _id: '$text', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 1 },
        ], function(err, results) {
          callback(err, results[0] && results[0]._id);
        });
      });
    },

    getFile(collabid, filepath, callback) {
      db.getDbs(function(err, mongo) {
        if (err) { return callback(err); }
        mongo.collection(FILES).findOne({ collabid, filepath }, function(err, file) {
          if (err || ! file) { return callback(err, file); }
          callback(null, file);          
        });
      });
    },

    getOps(collabid, filepath, cutoff, callback) {
      if (!cutoff) {
        cutoff = moment();
      } else {
        cutoff = moment(cutoff);
      }

      db.getDbs(function(err, mongo) {
        if (err) { return callback(err); }
        mongo.collection(FILES).findOne({ collabid, filepath }, function(err, file) {
          if (err || ! file) { return callback(err, file); }
          mongo.collection('o_'+FILES).aggregate([
            { $match: { d: file._id, 'm.ts': { $lte: +cutoff } } },
            { $group: { _id: null, v: { $max: '$v' } } },
          ], function(err, results) {
            if (err) { return callback(err); }
            let doc = { v: 0 };
            if ( ! results[0]) { 
              // There are no ops, so just return the empty list
              return callback(null, []); 
            }
            let version = results[0].v;
            mongo.collection('o_'+FILES).aggregate([
              { $match: { d: file._id, v: { $lte: version } } },
              { $sort: { v: 1 } },
              { $project: { _id: 0, create: 1, op: 1, v: 1, "m.ts": 1 } },
            ], function(err, ops) {
              if (err) { return callback(err); }
              callback(null, ops);
            });
          });
        });
      });
    },
    
    getHistorical(collabid, filepath, timestamp, callback) {
      this.getOps(collabid, filepath, timestamp, function(err, ops) {
        if (err) { return callback(err); }
        let doc = { v: 0 };
        for (let op of ops) {
          let err = sharedb.ot.apply(doc, op);
          if (err) { return callback(err); }
        }
        callback(null, doc);
      });
    },
    
    ping(collabid) {
      async.autoInject({
        collab(done) {
          let collab = connection.get(COLLABS, collabid);
          collab.fetch(err => done(err, collab));
        },
        ping(collab, done) {
          let ping = connection.get(PINGS, collab.data.project);
          ping.fetch(err => done(err, ping));
        },
        ping_created(ping, done) {
          if ( ! ping.type) {
            ping.create({ collabs: [ null, null, null, null, null, null ], idx: 0 }, done);
          } else { done(); }
        },
        ping_replace(collab, ping, ping_created, done) {
          let curr = ping.data;
          ping.submitOp([
            { p: [ 'collabs', curr.idx ], ld: curr.collabs[curr.idx],
                                          li: Object.assign({ collabid }, collab.data) },
            { p: [ 'idx' ], od: curr.idx,
                            oi: (curr.idx+1)%curr.collabs.length },
          ], done);
        },
        debug(ping, ping_replace, done) {
          done();
        },
      });
    },
  };
  
  return backend;
};
