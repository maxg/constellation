const async = require('async');
const crypto = require('crypto');
const mongodb = require('mongodb');
const sharedb = require('sharedb');

const COLLABS = 'collabs';
const USERS = 'users';
const FILES = 'files';
const PINGS = 'pings';

exports.createBackend = function createBackend(config) {
  
  const db = require('sharedb-mongo')(config.mongodb);
  const share = new sharedb({ db });
  
  let connection = share.connect();
  
  function authorize(req) {
    if (req.agent.stream.isServer) { return true; }
    if (req.agent.authstaff) { return true; }
    if (req.collection === COLLABS) {
      return req.snapshot.data.users.indexOf(req.agent.authusername) >= 0;
    }
    if (req.collection === FILES) { return true; }
    return false;
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
    if (authorize(req)) { return cb(); }
    console.error('denied doc', req.agent.authusername, req.collection, req.id);
    cb('403 Forbidden');
  });
  share.use('commit', function(req, cb) {
    if (authorize(req)) { return cb(); }
    console.error('denied commit', req.agent.authusername, req.collection, req.id);
    cb('403 Forbidden');
  });
  share.use('query', function(req, cb) {
    if (req.agent.stream.isServer || req.agent.authstaff) { return cb(); }
    console.error('denied query', req.agent.authusername, req.collection, req.query);
    cb('403 Forbidden');
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
    
    getHistorical(collabid, filepath, timestamp, callback) {
      db.getDbs(function(err, mongo) {
        if (err) { return callback(err); }
        mongo.collection(FILES).findOne({ collabid, filepath }, function(err, file) {
          if (err) { return callback(err); }
          mongo.collection('o_'+FILES).aggregate([
            { $match: { d: file._id, 'm.ts': { $lte: +timestamp } } },
            { $sort: { v: 1 } },
            { $project: { _id: 0, create: 1, op: 1, v: 1 } },
          ], function(err, ops) {
            if (err) { return callback(err); }
            let doc = { v: 0 };
            for (let op of ops) {
              let err = sharedb.ot.apply(doc, op);
              if (err) { return callback(err); }
            }
            callback(err, doc);
          });
        });
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
