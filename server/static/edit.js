var connection = new window.sharedb.Connection(new WebSocket(shareURL));

var collab = connection.get('collabs', collabid);
collab.fetch(function(err) {
  if (err) { throw err; }
  
  document.querySelector('#project').textContent = collab.data.project;
  var users = collab.data.users.filter(function(user) { return user !== authusername; });
  document.querySelector('#partners').textContent = users;
});

var textarea = document.querySelector('#text');

var doc = connection.get('files', collabid + '-' + filepath);
doc.on('create', function(created) { update(); });
doc.subscribe(update);

function update(err) {
  if (err) { throw err; }
  if ( ! doc.type) {
    document.querySelector('#error').textContent = 'file does not exist';
    return;
  }
  var binding = new window.sharedb.StringBinding(textarea, doc, [ 'text' ]);
  binding.setup();
}

if (document.querySelector('#debug')) {
  document.querySelector('#chatter').addEventListener('click', function() {
    setInterval(submitInsertRandom, 200);
  });
  document.querySelector('#select').addEventListener('click', function() {
    textarea.addEventListener('click', submitCursorUpdate);
    textarea.addEventListener('keyup', submitCursorUpdate);
    textarea.addEventListener('select', submitCursorUpdate);
  });
  
  function submitInsertRandom() {
    doc.submitOp({ p: [ 'text', 0 ], si: Math.random().toString(36).charAt(2) });
  }
  
  function submitCursorUpdate() {
    var offset = textarea.selectionDirection == 'backward' ? textarea.selectionStart : textarea.selectionEnd;
    var start = textarea.selectionStart;
    var length = textarea.selectionEnd - textarea.selectionStart;
    doc.submitOp({ p: [ 'cursors', authusername ], oi: length ? [ offset, start, length ] : [ offset ] });
  }
}
