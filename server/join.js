var events = require('events');
var fs = require('fs');
var mongodb = require('mongodb');

var display = fs.readFileSync(__dirname + '/config/words.txt', { encoding: 'utf8' }).trim().split(/\r?\n/);
var canonical = display.map(function(word) { return word.toLowerCase(); });

var active = {};

function randomKey(count) {
  var key = [];
  while (count-- > 0) {
    key.push(Math.floor(Math.random() * display.length ));
  }
  return key;
}

function displayWordsFromKey(key) {
  return key.map(function(idx) { return display[idx]; });
}

function keyFromCanonicalWords(words) {
  return words.map(function(word) { return canonical.indexOf(word); });
}

exports.code = function(data) {
  var count = 1;
  var iters = 0;
  do {
    if (iters++ > 10) { count += 1; }
    var key = randomKey(count);
  } while (Object.hasOwnProperty.call(active, key));
  active[key] = data;
  setTimeout(function() { delete active[key]; }, 1000 * 60 * 90);
  return displayWordsFromKey(key);
};

var joins = new events.EventEmitter();

exports.rendezvous = function(me, partner, callback) {
  if (me.constructor !== Array) { return callback(new Error('Invalid self joincode')); }
  if (partner.constructor !== Array) { return callback(new Error('Invalid partner joincode')); }
  
  me = keyFromCanonicalWords(me);
  partner = keyFromCanonicalWords(partner);
  
  if (me.indexOf(-1) >= 0) { return callback(new Error('Unknown self joincode')); }
  if (partner.indexOf(-1) >= 0) { return callback(new Error('Unknown partner joincode')); }
  if (me.toString() == partner) { return callback(new Error("Enter your partner's joincode")); }
  
  if ( ! active[me]) { return callback(new Error('Inactive self joincode')); }
  if ( ! active[partner]) { return callback(new Error('Inactive partner joincode')); }
  
  function join(id) {
    callback(null, { id: id, me: active[me], partner: active[partner] });
    callback = null;
  }
  var id = mongodb.ObjectID().toString();
  if (joins.emit([ me, partner ], id)) {
    join(id);
  } else {
    joins.once([ partner, me ], join);
    setTimeout(function() {
      joins.removeListener([ partner, me ], join);
      if (callback) { callback(new Error('Timed out')); }
    }, 1000 * 60 * 5);
  }
};
