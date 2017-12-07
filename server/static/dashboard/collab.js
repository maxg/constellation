var connection = new window.sharedb.Connection(new WebSocket(shareURL));

var collab = connection.get('collabs', collabid);
collab.fetch(function(err) {
  if (err) { throw err; }
  
  document.querySelector('#partners').textContent = collab.data.users.slice().sort().join(' & ')
});

connection.createFetchQuery('files', { collabid: collabid }, {}, function(err, files) {
  if (err) { throw err; }
  
  // Example for using the visual parameter to show different visualizations
  if (visual == 1) {
    showFiles_visual1(files);
  } else if (visual == 2) {
    showFiles_visual2(files);
  } else {
    showFiles_basic(files);
  }
});

function showFiles_basic(files) {
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
  });
}


/** Visual 1: Total diff */
function showFiles_visual1(files) {
  // TODO: Also do the subscribe thing

  var list = document.querySelector('#files');
  files.sort(function(a, b) { return a.data.filepath.localeCompare(b.data.filepath); });
  files.forEach(function(file) {

    var url = '/ops/' + project + '/' + collabid + '/' + file.data.filepath
      + (cutoff ? '?cutoff=' + cutoff : '');

    $.ajax(url).done(function(diff) {
      var item = document.importNode(document.querySelector('#file').content, true);
      var heading = item.querySelector('h4');
      heading.textContent = file.data.filepath;
      var codeBlock = item.querySelector('.diff code');
      list.appendChild(item);

      diff.forEach(function(part){
        var elt = document.createElement('span');

        if (part.added) {
          elt.classList.add('span-added');
        } else if (part.removed) {
          elt.classList.add('span-removed');
          if (part.original) {
            elt.classList.add('span-original');
          }
        } else {
          elt.classList.add('span-original');
        }

        elt.appendChild(document.createTextNode(part.value));
        codeBlock.appendChild(elt);
      });

      // TODO: Add syntax highlighting?
      // TODO: Make green less bright

    }).fail(function(req, status, err) {
      list.textContent = 'Error fetching ops: ' + errorToString(req.responseJSON, status, err);
    });

  });

}

function showFiles_visual2(files) {
  var list = document.querySelector('#files');

  files.sort(function(a, b) { return a.data.filepath.localeCompare(b.data.filepath); });
  files.forEach(function(file) {
    var item = document.importNode(document.querySelector('#file').content, true);
    var heading = item.querySelector('h4');
    heading.textContent = file.data.filepath + " VISUALZATION 2";
    list.appendChild(item);
  });

}

// Used for basic visual
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
