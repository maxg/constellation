var async = require('async');
var livedb = require('livedb');

var config = require('./config');

var COLLABS = 'collabs';
var USERS = 'users';

exports.createBackend = function() {
  
  var store = function() { switch (config.livedb) {
    case 'memory': return livedb.memory();
    case 'mongodb': return require('livedb-mongo').apply(null, config.mongodb);
    default: throw 'Missing config.livedb';
  }; }();
  
  var backend = livedb.client(store);
  
  // fetch a user -> callback(err, snapshot)
  function fetchUser(username, callback) {
    backend.fetch(USERS, username, callback);
  }
  
  // add a user to a collaboration -> callback(err)
  function addUserToCollaboration(username, collabid, callback) {
    async.auto({
      collab: function(done) {
        var emptyCollab = { users: [], activity: {} };
        // create collab if needed
        backend.submit(COLLABS, collabid, { create: { type: 'json0', data: emptyCollab } }, function(err, ver) {
          // add user to users list
          var insert = { p: [ 'users', 0 ], li: username };
          backend.submit(COLLABS, collabid, { op: [ insert ] }, done);
        });
      },
      user: function(done) {
        var emptyUser = { collabids: [] };
        // create user if needed
        backend.submit(USERS, username, { create: { type: 'json0', data: emptyUser } }, function(err, ver) {
          // put new collabid at the front of the collabids list
          var insert = { p: [ 'collabids', 0 ], li: collabid };
          backend.submit(USERS, username, { op: [ insert ] }, done);
        });
      }
    }, callback);
  }
  
  return {
    backend: backend,
    
    fetchUser: fetchUser,
    addUserToCollaboration: addUserToCollaboration,
  };
};
