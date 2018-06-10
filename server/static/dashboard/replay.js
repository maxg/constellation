var connection = new window.sharedb.Connection(new WebSocket(shareURL));

var replayID;

$.ajax('/ops/' + project).done(function(result) {
  var collabs = result.collabs;
  var newcollabids = result.newcollabids;
  console.log('fetched');
  console.log(collabs);
  for (var collabid in collabs) {
    var collab = collabs[collabid];
    collab.users = [];
    for (var filepath in collab.files) {
      var ops = collab.files[filepath].ops;
      ops.forEach(function(op) {
        var username = getUsernameFromCursorOp(op);
        if (username && collab.users.indexOf(username) < 0) collab.users.push(username);
      });
    }
  }
  console.log('parsed');

  document.querySelector('#startReplay').addEventListener('click', function() {
    var targetProject = document.querySelector('#targetProject').value;
    var startTimestamp = Date.parse(document.querySelector('#startTimestamp').value);
    replay(collabs, newcollabids, Date.now(), startTimestamp, targetProject);
  });

  document.querySelector('#stopReplay').addEventListener('click', stopReplay);
});

function replay(collabs, newcollabids, startTime, minTimestamp, targetProject) {
  if (ops.length == 0) return;
  var delta = Date.now() - startTime;
  while (ops[ops.length - 1].m.ts - minTimestamp <= delta) {
    handleOp(ops.pop(), newcollabids, targetProject);
  }
  if (ops.length == 0) return;
  replayID = setTimeout(
    function() { replay(ops, newcollabids, startTime, minTimestamp, targetProject); },
    ops[ops.length - 1].m.ts - minTimestamp - delta
  );
}

function handleOp(op, newcollabids, targetProject) {
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
    doc.create(Object.assign({}, op.create.data, { collabid: newcollabid, project: targetProject }));
    collabs[collabid].files[filepath] = doc;
    console.log('created file');
  } else if (op.op) {
    // submit op
    var doc = collabs[collabid].files[filepath];
    op.op.forEach(function(op) {
      doc.submitOp(op);
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

