var window = {};

var console = function() {
  function format() {
    var msg = arguments[0] ? String(arguments[0]) : "";
    var pattern = /%[sdifo]/;
    for (var i = 1; i < arguments.length; i++) {
      msg = pattern.test(msg) ? msg.replace(pattern, String(arguments[i]))
                              : msg + " " + arguments[i];
    }
    return msg;
  }
  
  var console = {};
  
  console.log = function() {
    java.lang.System.out.println(format.apply(null, arguments));
  };
  console.warn = function() {
    java.lang.System.out.println(format.apply(null, arguments));
  };
  console.error = function() {
    java.lang.System.err.println(format.apply(null, arguments));
  };
  
  return console;
}();

var setTimeout = function(callback, delay) {
  return TIMERS.setTimeout(callback, delay, arguments);
};

var clearTimeout = function(future) {
  if (future !== null) { TIMERS.clearTimeout(future); }
};

var setInterval = function(callback, delay) {
  return TIMERS.setInterval(callback, delay, arguments);
};

var clearInterval = function(future) {
  if (future !== null) { TIMERS.clearInterval(future); }
};

var open = function(collab, path, contents, callback) {
  var doc = CONNECTION.get('collab_' + collab, path);
  doc.subscribe();
  doc.whenReady(function() {
    var contextCallback = function() {
      // Contexts is technically misnamed because it is used to store
      // the JSON doc for cursors as well. If the JSON API for share.js
      // ever works, using the cursor context is preferable to the doc.
      var contexts = {};
      var ctx = doc.createContext();
      ctx._document = doc;
      contexts.text = ctx;

      // set up cursor document and contexts
      var cursors = CONNECTION.get('collab_' + collab, path + '_cursors');
      cursors.subscribe();
      cursors.whenReady(function() {
        if (!cursors.type) {
          cursors.create('json0', {}, undefined);
        }
        contexts.cursors = cursors;
        callback(contexts, ctx.get().toString());
      });
    };
    
    if ( ! doc.type) {
      doc.create('text', contents, undefined, contextCallback);
    } else {
      contextCallback();
    }
  });
};

var attach = function(contexts, sharedoc) {
  contexts.text.onInsert = function(pos, text) {
    sharedoc.onRemoteInsert(pos, text);
  };
  contexts.text.onRemove = function(pos, len) {
    sharedoc.onRemoteRemove(pos, len);
  };
  contexts.cursors.on('after op', function(op, context) {
    var userId = op[0].p[0];
    var remoteOffset = op[0].oi.offset;
    sharedoc.onRemoteCaretMove(userId, remoteOffset);
  });
  contexts.cursors.caretMoved = function(userId, offset) {
    contexts.cursors.submitOp({p:[userId], oi:{offset: offset}});
  };
  return contexts.text.get().toString();
};

var detach = function(contexts, sharedoc) {
  contexts.text._document.destroy();
};
