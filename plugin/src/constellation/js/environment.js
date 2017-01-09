window = {};

console = function() {
  function format() {
    var msg = arguments[0] ? String(arguments[0]) : "";
    var pattern = /%[sdifo]/;
    for (var i = 1; i < arguments.length; i++) {
      msg = pattern.test(msg) ? msg.replace(pattern, String(arguments[i]))
                              : msg + " " + arguments[i];
    }
    return msg;
  }
  
  var System = Java.type('java.lang.System');
  
  return {
    log: function log() { System.out.println(format.apply(null, arguments)); },
    warn: function log() { System.out.println(format.apply(null, arguments)); },
    error: function log() { System.err.println(format.apply(null, arguments)); },
  };
}();

setTimeout = function setTimeout(callback, delay) {
  return JSEngineBindings.setTimeout(callback.bind(null, arguments), delay);
};

clearTimeout = function clearTimeout(future) {
  if (future != null) { future.cancel(false); }
};

setInterval = function setInterval(callback, delay) {
  return JSEngineBindings.setInterval(callback.bind(null, arguments), delay);
};

clearInterval = function clearInterval(future) {
  if (future != null) { future.cancel(false); }
};
