const events = require('events');
const fs = require('fs');
const mongodb = require('mongodb');

exports.create = function create(config) {
  
  const display = fs.readFileSync(`${config.dir}/words.txt`, { encoding: 'utf8' })
                    .trim().split(/\r?\n/);
  const canonical = display.map(word => word.toLowerCase());
  
  const active = {};
  const joins = new events.EventEmitter();
  
  function randomKey(length) {
    return Array.from({ length }, () => Math.floor(Math.random() * display.length));
  }
  
  function displayWordsFromKey(key) {
    return key.map(idx => display[idx]);
  }
  
  function keyFromCanonicalWords(words) {
    return words.map(word => canonical.indexOf(word));
  }
  
  return {
    code(data) {
      let length = 1;
      let iterations = 0;
      let key;
      do {
        if (iterations++ > 10) { length++; iterations = 0; }
        key = randomKey(length);
      } while (Object.hasOwnProperty.call(active, key));
      active[key] = data;
      setTimeout(() => delete active[key], 1000 * 60 * 90);
      return displayWordsFromKey(key);
    },
    
    rendezvous(me, partner, callback) {
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
        callback(null, { id, me: active[me], partner: active[partner] });
        callback = null;
      }
      let id = mongodb.ObjectID().toString();
      if (joins.emit([ me, partner ], id)) {
        join(id);
      } else {
        joins.once([ partner, me ], join);
        setTimeout(function() {
          joins.removeListener([ partner, me ], join);
          if (callback) { callback(new Error('Timed out')); }
        }, 1000 * 60 * 5);
      }
    },
  };
};
