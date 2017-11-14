var connection = new window.sharedb.Connection(new WebSocket(shareURL));

var collab = connection.get('collabs', collabid);
collab.fetch(function(err) {
  if (err) { throw err; }
  
  document.querySelector('#partners').textContent = collab.data.users.slice().sort().join(' & ')
});

connection.createFetchQuery('files', { collabid: collabid }, {}, function(err, files) {
  if (err) { throw err; }
  
  var list = document.querySelector('#files');
  files.sort(function(a, b) { return a.data.filepath.localeCompare(b.data.filepath); });
  files.forEach(function(file) {
    var item = document.importNode(document.querySelector('#file').content, true);
    var heading = item.querySelector('h4');
    heading.textContent = file.data.filepath;
    var diff = item.querySelector('.diff code');
    list.appendChild(item);
    
    $.ajax('/baseline/' + project + '/' + file.data.filepath).done(function(baseline) {
      if (cutoff) {
        $.ajax('/historical/' + project + '/' + collabid + '/' + file.data.filepath + '/' + cutoff).done(function(historical) {
          updateDiff(diff, baseline, historical.data ? historical.data.text : undefined);
        }).fail(function(req, status, err) {
          diff.textContent = 'Error fetching code: ' + errorToString(req.responseJSON, status, err);
        });
      } else {
        file.subscribe(function() {
          updateDiff(diff, baseline, file.data.text);
          file.on('op', function() {
            updateDiff(diff, baseline, file.data.text);
          });
        });
      }
    }).fail(function(req, status, err) {
      diff.textContent = 'Error fetching baseline: ' + errorToString(req.responseJSON, status, err);
    });

    // TODO: Give it its own div
    var opsDiv = document.querySelector('#files');
    $.ajax('/ops/' + project + '/' + collabid + '/' + file.data.filepath).done(function(diffs) {
      console.log("result:");
      console.log(diffs);

      diffs.forEach(function(diff) {
        var diffNode = document.createElement('div');
        var heading = document.createElement('h3');
        heading.appendChild(document.createTextNode('Diff for ' + file.data.filepath));
        diffNode.appendChild(heading);

        var preBlock = document.createElement('pre');
        preBlock.classList.add('diff');
        var codeBlock = document.createElement('code');
        codeBlock.classList.add('java');

        diffNode.appendChild(preBlock);
        preBlock.appendChild(codeBlock);

        // TODO: Probably don't need all those HTML elements

        diff.forEach(function(part){
          // green for additions, red for deletions
          // grey for common parts
          var elt = document.createElement('span');
          color = part.added ? 'green' :
                     part.removed ? 'red' : 'grey';
          elt.style.color = color;
          elt.appendChild(document.createTextNode(part.value));
          codeBlock.appendChild(elt);
        });

        opsDiv.appendChild(diffNode);
      });

    }).fail(function(req, status, err) {
      opsDiv.textContent = 'Error fetching ops: ' + errorToString(req.responseJSON, status, err);
    });

  });
});

function updateDiff(node, baseline, text) {
  if (baseline === undefined || text === undefined) { return; }
  node.innerHTML = '';
  window.diff.diffLines(baseline.trim(), text.trim()).forEach(function(part) {
    var elt = document.createElement('div');
    elt.classList.add('diff-part');
    if (part.added) {
      elt.classList.add('diff-added');
      elt.appendChild(document.createTextNode(part.value));
    } else if (part.removed) {
      elt.classList.add('diff-removed');
    } else {
      elt.appendChild(document.createTextNode(part.value));
    }
    node.appendChild(elt);
  });
  hljs.highlightBlock(node);
}

function errorToString(json, status, err) {
  return (json && json.code || status) + ' ' + (json && json.message || err);
}
