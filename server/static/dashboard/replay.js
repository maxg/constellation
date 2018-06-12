var connection = new window.sharedb.Connection(new WebSocket(shareURL));

$.ajax('/newcollabids/' + project).done(function(newcollabids) {
  var opsfileinput = document.querySelector('#opsFile');
  var filereader = new FileReader();
  var startbutton = document.querySelector('#startReplay');
  var stopbutton = document.querySelector('#stopReplay');

  startbutton.disabled = false;
  stopbutton.disabled = false;

  opsfileinput.addEventListener('change', function() {
    filereader.readAsText(opsfileinput.files[0]);
  });

  filereader.addEventListener('load', function() {
    var collabs = JSON.parse(filereader.result);
    // reverse ops to pop from the end
    for (var collabid in collabs) {
      var collab = collabs[collabid];
      collab.ops.reverse();
      for (var filepath in collab.files) {
        collab.files[filepath].ops.reverse();
      }
    }

    startbutton.onclick = function() {
      var project = document.querySelector('#targetProject').value;
      var mintime = Date.parse(document.querySelector('#startTimestamp').value);
      replay(collabs, newcollabids, Date.now(), mintime, project);
    };
  });

  stopbutton.onclick = stopReplay;
});

var replayID;

function replay(collabs, newcollabids, starttime, mintime, project) {
  var delta = Date.now() - starttime;
  var handledop = false;
  var minoptime = Date.now();
  for (var collabid in collabs) {
    var collab = collabs[collabid];
    while (collab.ops.length > 0 && collab.ops[collab.ops.length - 1].m.ts - mintime <= delta) {
      handleCollabOp(project, newcollabids[collabid], collab, collab.ops.pop());
      handledop = true;
    }
    if (collab.ops.length > 0) {
      minoptime = Math.min(minoptime, collab.ops[collab.ops.length - 1].m.ts);
    }
    for (var filepath in collab.files) {
      var file = collab.files[filepath];
      while (file.ops.length > 0 && file.ops[file.ops.length - 1].m.ts - mintime <= delta) {
        handleFileOp(project, newcollabids[collabid], filepath, file, file.ops.pop());
        handledop = true;
      }
      if (file.ops.length > 0) {
        minoptime = Math.min(minoptime, file.ops[file.ops.length - 1].m.ts);
      }
    }
  }
  if (handledop) {
    replayID = setTimeout(function() {
      replay(collabs, newcollabids, starttime, mintime, project);
    }, minoptime - mintime - delta);
  }
}

function handleCollabOp(project, collabid, collab, op) {
  if (op.create) {
    collab.doc = connection.get('collabs', collabid);
    collab.doc.create(Object.assign({}, op.create.data, { project: project }));
    console.log('created collab');
  } else if (op.op) {
    op.op.forEach(function(op) {
      collab.doc.submitOp(op);
      console.log('submitted collab op');
    });
  }
}

function handleFileOp(project, collabid, filepath, file, op) {
  if (op.create) {
    var fileid = collabid + '-' + filepath;
    file.doc = connection.get('files', fileid);
    file.doc.create(Object.assign({}, op.create.data, { collabid: collabid, project: project }));
    console.log('created file');
  } else if (op.op) {
    op.op.forEach(function(op) {
      file.doc.submitOp(op);
      console.log('submitted file op');
    });
  } 
}

function stopReplay() {
  clearTimeout(replayID);
}

