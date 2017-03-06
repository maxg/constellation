var connection = new window.sharedb.Connection(new WebSocket(shareURL));

var collab = connection.get('collabs', collabid);
collab.fetch(function(err) {
  if (err) { throw err; }
  
  document.querySelector('#partners').textContent = collab.data.users.slice().sort().join(' & ');
  
  if (milestone) {
    if ( ! checkoff.data) {
      checkoff.on('load', showMilestoneFiles);
    } else {
      showMilestoneFiles();
    }
  } else {
    showHistoricalFiles();
  }
});

function showMilestoneFiles() {
  if ( ! checkoff.data) { return; }
  cutoff = checkoff.data.cutoff || checkoff.data.modified;
  showHistoricalFiles();
}

function showHistoricalFiles() {
  var base = '/show/' + project + '/' + collabid + '/';
  document.querySelector('#earlier').href = base + moment(cutoff).subtract(5, 'minutes').toLocal();
  document.querySelector('#later').href = base + moment(cutoff).add(5, 'minutes').toLocal();
  
  connection.createFetchQuery('files', { collabid: collabid }, {}, function(err, files) {
    if (err) { throw err; }
    
    document.querySelector('#files-header').classList.remove('hidden');
    var list = document.querySelector('#files');
    files.sort(function(a, b) { return a.data.filepath.localeCompare(b.data.filepath); });
    files.forEach(function(file) {
      var item = document.importNode(document.querySelector('#file').content, true);
      var heading = item.querySelector('h4');
      heading.textContent = file.data.filepath;
      var code = item.querySelector('pre code');
      list.appendChild(item);
      
      $.ajax('/historical/' + project + '/' + collabid + '/' + file.data.filepath + '/' + cutoff).done(function(historical) {
        code.textContent = historical.data ? historical.data.text : undefined;
        hljs.highlightBlock(code);
      }).fail(function(req, status, err) {
        code.textContent = 'Error fetching code: ' + errorToString(req.responseJSON, status, err);
      });
    });
  });
}

function errorToString(json, status, err) {
  return (json && json.code || status) + ' ' + (json && json.message || err);
}
