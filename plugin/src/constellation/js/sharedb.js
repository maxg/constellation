var Activator = Java.type('constellation.Activator');
var Debug = Java.type('constellation.Debug');
var Log = Java.type('constellation.Log');

var connection = new window.sharedb.Connection(CollaborationInstance.socket);

if (Activator.debug()) {
  // connection.debug = true;
}

connection.on('state', function(newState, reason) {
  CollaborationInstance.onConnectionState(newState, reason);
});
connection.on('error', function(err) { throw err; });
//connection.on('connection error', function(err) {
//  Log.warn('ShareDB connection transient socket error');
//});

var collab = connection.get('collabs', CollaborationInstance.collabid);

collab.on('error', function(err) {
  console.error('error', collab, err);
});

collab.fetch(function(err) {
  if (err) { console.error(err); }
});

function open(path, contents, callback) {
  Debug.trace(path);
  
  var doc = connection.get('files', CollaborationInstance.collabid + '-' + path);
  doc.once('create', function(created) { update(); });
  doc.subscribe(update);
  
  function update(err) {
    Debug.trace();
    
    if (err) { throw err; }
    if ( ! doc.type) {
      return doc.create({
        collabid: CollaborationInstance.collabid,
        project: CollaborationInstance.project.getName(),
        filepath: path,
        text: contents,
        cursors: {},
        markers: {}
      }, function(err) {
        if (err && err.code !== 4016) { throw err; }
      });
    }
    callback(doc, doc.data.text);
    callback = undefined;
  }
}

function attach(doc, sharedoc) {
  Debug.trace();
  
  doc.on('op', doc.attachedOpListener = function onOp(op, source) {
    if (source) { return; } // local op, ignore
    if (op.length === 0) { return; }
    if (op.length > 1) { throw new Error('op with multiple components'); }
    var component = op[0];
    if (component.p[0] === 'text') {
      handleTextOp(component.p[component.p.length - 1], component.si, component.sd)
    }
    if (component.p[0] === 'cursors') {
      handleCursorOp(component.p[component.p.length - 1], doc.data.cursors);
    }
  });
  
  function handleTextOp(offset, inserted, deleted) {
    if (inserted) { sharedoc.onRemoteInsert(offset, inserted); }
    if (deleted) { sharedoc.onRemoteRemove(offset, deleted.length); }
  }
  
  function handleCursorOp(username, cursors) {
    sharedoc.onRemoteCursorUpdate(username, cursors[username]);
  }
  
  return doc.data.text;
}

function submitInsert(doc, offset, text) {
  doc.submitOp({ p: [ 'text', offset ], si: text });
}

function submitRemove(doc, offset, length) {
  doc.submitOp({ p: [ 'text', offset ], sd: doc.data.text.substr(offset, length) });
}

function submitCursorUpdate(doc, offset, start, length) {
  doc.submitOp({ p: [ 'cursors', CollaborationInstance.me ], oi: length ? [ offset, start, length ] : [ offset ] });
}

function submitMarkersUpdate(doc, markers) {
  var list = [];
  for (var i = 0; i < markers.length; i++) {
    var marker = markers[i];
    list.push({ lineNumber: marker.lineNumber, message: marker.message, severity: marker.severity });
  }
  doc.submitOp({ p: [ 'markers', CollaborationInstance.me ], oi: list });
}

function close(doc) {
  Debug.trace();
  
  doc.removeListener('op', doc.attachedOpListener);
  doc.attachedOpListener = undefined;
  doc.destroy();
}

function disconnect(callback) {
  Debug.trace();
  
  collab.destroy();
  collab = undefined;
  if (connection.state == 'disconnected') {
    setTimeout(disconnected, 0);
  } else {
    connection.once('state', disconnected);
  }
  connection.close();
  connection = undefined;
  
  function disconnected() {
    Debug.trace();
    
    CollaborationInstance = undefined;
    callback();
    callback = undefined;
  }
}
