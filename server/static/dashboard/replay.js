$.ajax('/newcollabids/' + project).done(function(newcollabids) {
  var connection = new window.sharedb.Connection(new WebSocket(shareURL));

  var opsfileinput = document.querySelector('#opsFile');
  var filereader = new FileReader();
  var getopsbutton = document.querySelector('#getOps');
  var startbutton = document.querySelector('#startReplay');
  var stopbutton = document.querySelector('#stopReplay');
  var status = document.querySelector('#status');

  getopsbutton.disabled = false;
  startbutton.disabled = false;
  stopbutton.disabled = false;

  status.innerText = 'New collab IDs loaded';

  getopsbutton.addEventListener('click', function() {
    status.innerText = 'Downloading ops 0%';
    var collabs = {};
    var numcollabs = Object.keys(newcollabids).length;
    var numloaded = 0;
    for (var collabid in newcollabids) {
      $.ajax('/ops/collab/' + collabid).done(function(collab) {
        collabs[collab.id] = collab;
        numloaded++;
        status.innerText = 'Downloading ops ' + Math.round(numloaded / numcollabs * 100) + '%';
        if (numloaded == numcollabs) {
          var blob = new Blob([JSON.stringify(collabs)], { type: 'application/json'});
          var link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = project + '-ops.json';
          link.innerText = 'Download';
          status.appendChild(link);
        }
      });
    }
  });

  opsfileinput.addEventListener('change', function() {
    status.innerText = 'Loading ops file...';
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

    status.innerText = 'Ops file loaded';

    startbutton.onclick = function() {
      var project = document.querySelector('#targetProject').value;
      var mintime = Date.parse(document.querySelector('#startTimestamp').value);
      replay(collabs, newcollabids, Date.now(), mintime, project);
    };
  });

  stopbutton.onclick = stopReplay;

  var replayID;

  function replay(collabs, newcollabids, starttime, mintime, project) {
    var delta = Date.now() - starttime;
    var handledop = false;
    var minoptime = Date.now();
    var numopsremaining = 0;
    for (var collabid in collabs) {
      var collab = collabs[collabid];
      while (collab.ops.length > 0 && collab.ops[collab.ops.length - 1].m.ts - mintime <= delta) {
        handleCollabOp(project, newcollabids[collabid], collab, collab.ops.pop());
        handledop = true;
      }
      numopsremaining += collab.ops.length;
      if (collab.ops.length > 0) {
        minoptime = Math.min(minoptime, collab.ops[collab.ops.length - 1].m.ts);
      }
      for (var filepath in collab.files) {
        var file = collab.files[filepath];
        while (file.ops.length > 0 && file.ops[file.ops.length - 1].m.ts - mintime <= delta) {
          handleFileOp(project, newcollabids[collabid], filepath, file, file.ops.pop());
          handledop = true;
        }
        numopsremaining += file.ops.length;
        if (file.ops.length > 0) {
          minoptime = Math.min(minoptime, file.ops[file.ops.length - 1].m.ts);
        }
      }
    }
    status.innerText = numopsremaining + ' ops remaining';
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
});
