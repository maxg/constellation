var connection = new window.sharedb.Connection(new WebSocket(shareURL));

$('#startReplay').click(e => {
  var targetProject = $('#targetProject')[0].value;
  var startTimestamp = Date.parse($('#startTimestamp')[0].value);
  startReplay(startTimestamp, targetProject);
});

$('#stopReplay').click(e => stopReplay());

var ops = []; // raw ops
var newcollabids = {}; // old collab id => new collab id
var collabs = {}; // old collabid => { doc: collabdoc, users: [], files: { path => doc } }
var replayID;

$.ajax('/ops/' + project).done(function(_ops) {
  ops = _ops.ops;
  newcollabids = _ops.newcollabids;
  console.log('fetched');
  ops.sort((a, b) => (b.m.ts - a.m.ts) == 0 ? (b.v - a.v) : (b.m.ts - a.m.ts));
  console.log('sorted');
  ops.forEach(op => {
    var tokens = op.d.split('-');
    var collabid = tokens[0];
    var filepath = tokens[1];
    if (!collabs[collabid]) collabs[collabid] = { users: {}, files: {} };
    collabs[collabid].files[filepath] = false;
    var username = getUsernameFromCursorOp(op);
    if (username) collabs[collabid].users[username] = true;
  });
  for (var collabid in collabs) {
    var users = collabs[collabid].users;
    collabs[collabid].users = [];
    for (var username in users) collabs[collabid].users.push(username);
  }
  console.log('parsed');
});

function startReplay(minTimestamp, targetProject) {
  var startTime = Date.now();
  replay(startTime, minTimestamp, targetProject);
}

function replay(startTime, minTimestamp, targetProject) {
  if (ops.length == 0) return;
  var delta = Date.now() - startTime;
  while (ops[ops.length - 1].m.ts - minTimestamp <= delta) {
    handleOp(ops.pop(), targetProject);
  }
  if (ops.length == 0) return;
  replayID = setTimeout(
    () => replay(startTime, minTimestamp, targetProject),
    ops[ops.length - 1].m.ts - minTimestamp - delta
  );
}

function handleOp(op, targetProject) {
  var collabid = op.d.split('-')[0];
  var newcollabid = newcollabids[collabid];
  var filepath = op.d.split('-')[1];
  if (!collabs[collabid].doc) {
    // create collab doc
    collabs[collabid].doc = connection.get('collabs', newcollabid);
    collabs[collabid].doc.create({
      ['users']: collabs[collabid].users,
      project: targetProject
    });
    console.log('created collab');
  }
  if (op.create) {
    // create file doc
    var fileid = newcollabid + '-' + filepath;
    var doc = connection.get('files', fileid);
    doc.create({
      collabid: newcollabid,
      project: targetProject,
      filepath: filepath,
      text: op.create.data.text,
      cursors: op.create.data.cursors,
      markers: op.create.data.markers || {}
    });
    collabs[collabid].files[filepath] = doc;
    console.log('created file');
  } else if (op.op) {
    // submit op
    var doc = collabs[collabid].files[filepath];
    op.op.forEach(_op => {
      doc.submitOp(_op);
    });
    console.log('submitted op');
  } 
}

function stopReplay() {
  clearTimeout(replayID);
}

function getUsernameFromCursorOp(op) {
  op = op.op || [];
  op = op[0] || {};
  var p = op.p || [];
  if (p[0] == 'cursors') return p[1];
  return null;
}

