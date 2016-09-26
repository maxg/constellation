const async = require('async');
const mongodb = require('mongodb');
const sharedb = require('sharedb');

const COLLABS = 'collabs';
const USERS = 'users';
const FILES = 'files';

exports.createBackend = function createBackend(config) {
  
  const db = require('sharedb-mongo')(config.mongodb);
  const share = new sharedb({ db });
  
  let connection = share.connect();
  
  return {
    share,
    
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
        collab(done) { done(null, connection.get(COLLABS, collabid)); },
        collab_created(collab, done) {
          if ( ! collab.type) {
            collab.create({ [USERS]: [], project }, done);
          } else { done(); }
        },
        user(done) { done(null, connection.get(USERS, username)); },
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
            { $project: { _id: 0, create: 1, op: 1 } },
          ], function(err, ops) {
            if (err) { return callback(err); }
            let doc = {};
            for (let op of ops) {
              if (op.create) { doc = op.create; }
              if (op.op) { doc.data = sharedb.types.map[doc.type].apply(doc.data, op.op); }
            }
            callback(err, doc);
          });
        });
      });
    },
  };
};
