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
  TIMERS.setTimeout(callback, delay, arguments);
};

var open = function(collab, path, contents, callback) {
  var doc = CONNECTION.get(collab, path);
  doc.subscribe();
  doc.whenReady(function() {
    
    var contextCallback = function() {
      var ctx = doc.createContext();
      callback(ctx, ctx.get().toString());
    };
    
    if ( ! doc.type) {
      doc.create('text', contents, undefined, contextCallback);
    } else {
      contextCallback();
    }
  });
};

var attach = function(ctx, sharedoc) {
  ctx.onInsert = function(pos, text) {
    sharedoc.onRemoteInsert(pos, text);
  };
  ctx.onRemove = function(pos, len) {
    sharedoc.onRemoteRemove(pos, len);
  };
  return ctx.get().toString();
};

var detach = function(ctx) {
  ctx.destroy();
};
