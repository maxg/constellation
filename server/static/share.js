var socket = new WebSocket(shareURL);
var connection = new window.sharejs.Connection(socket);

(function() {
  var orig = { onmessage: socket.onmessage, send: socket.send };
  socket.onmessage = function(msg) { orig.onmessage(JSON.parse(msg.data)); };
  socket.send = function(msg) { orig.send.call(socket, JSON.stringify(msg)); };
})();
