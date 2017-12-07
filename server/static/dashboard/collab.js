var connection = new window.sharedb.Connection(new WebSocket(shareURL));

var collab = connection.get('collabs', collabid);
collab.fetch(function(err) {
  if (err) { throw err; }
  
  document.querySelector('#partners').textContent = collab.data.users.slice().sort().join(' & ')
});

connection.createFetchQuery('files', { collabid: collabid }, {}, function(err, files) {
  if (err) { throw err; }
  
  // TODO: Do the file.subscribe stuff to update the view

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

    $.ajax('/ops/' + project + '/' + collabid + '/' + file.data.filepath).done(function(diff) {

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

    }).fail(function(req, status, err) {
      list.textContent = 'Error fetching ops: ' + errorToString(req.responseJSON, status, err);
    });

  });
}

function showFiles_visual1(files) {
  var list = document.querySelector('#files');

  files.sort(function(a, b) { return a.data.filepath.localeCompare(b.data.filepath); });
  files.forEach(function(file) {
    var item = document.importNode(document.querySelector('#file').content, true);
    var heading = item.querySelector('h4');
    heading.textContent = file.data.filepath + " VISUALZATION 1";
    list.appendChild(item);
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


function errorToString(json, status, err) {
  return (json && json.code || status) + ' ' + (json && json.message || err);
}
