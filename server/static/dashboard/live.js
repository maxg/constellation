var connection = new window.sharedb.Connection(new WebSocket(shareURL));

var collabs = connection.createSubscribeQuery('collabs', {
  project: project,
  $sort: { '_m.ctime': -1 }
}, {});

collabs.on('ready', function() { insertCollabs(collabs.results, 0); });
collabs.on('insert', insertCollabs);

var searchbox = document.querySelector('#search');
var countdisplay = document.querySelector('#matches');

var searchregex = undefined;
searchbox.addEventListener('input', function() {
  searchregex = undefined;
  if (searchbox.value.length > 0) {
    try {
      searchregex = new RegExp(searchbox.value, 'i');
    } catch (e) {}
  }
});

function insertCollabs(collabs, atIndex) {
  var list = document.querySelector('#collabs');
  collabs.forEach(function(collab, idx) {
    var item = document.importNode(document.querySelector('#collab').content, true);
    var root = item.querySelector('.collab');
    root.setAttribute('id', 'collab-' + collab.id);
    let users = collab.data.users.slice().sort();
    root.dataset.users = users.join(',');
    var link = item.querySelector('a');
    var href = '/dashboard/' + project + '/' + collab.id;
    link.setAttribute('href', href);
    link.textContent = users.join('\n');
    list.insertBefore(item, list.children[atIndex + idx]);

    // TODO: move into view file
    var codeline = document.createElement('span');
    codeline.style.fontSize = '8px';
    codeline.style.background = 'rgba(252, 248, 227)';
    root.querySelector('.panel-body').appendChild(document.createElement('br'));
    root.querySelector('.panel-body').appendChild(codeline);

    connection.createFetchQuery('files', { collabid: collab.id }, {}, function(err, files) {
      if (err) { throw err; }

      var typingtimeoutid = undefined;
      function updateTypingDisplay() {
        root.classList.add('typing');
        clearTimeout(typingtimeoutid);
        typingtimeoutid = setTimeout(function() {
          root.classList.remove('typing');
        }, 1000);
      }

      function updateErrorDisplay() {
        var maxlevel = 0;
        files.forEach(function(file) {
          for (var k in file.data.markers) {
            file.data.markers[k].forEach(function(marker) {
              maxlevel = Math.max(maxlevel, marker.severity);
            });
          }
        });
        root.classList.remove('error');
        root.classList.remove('warning');
        if (maxlevel == 2) root.classList.add('error');
        else if (maxlevel == 1) root.classList.add('warning');
      }

      function updateMatchDisplay() {
        if (searchregex) {
          var match = false;
          codeline.innerText = '';
          files.forEach(function(file) {
            var matchdata = file.data.text.match(searchregex);
            if (matchdata) {
              match = true;
              codeline.innerText = findLineForIndex(matchdata.input, matchdata.index);
            }
          });
          if (match) root.classList.add('match');
          else root.classList.remove('match');
          countdisplay.innerHTML = document.getElementsByClassName('match').length
                           + '/' + document.getElementsByClassName('connected').length;
        } else {
          root.classList.remove('match');
          codeline.innerText = '';
        }
      }

      searchbox.addEventListener('input', updateMatchDisplay);

      files.forEach(function(file) {
        file.subscribe(function() {
          root.classList.remove('disconnected');
          root.classList.add('connected');
          updateMatchDisplay();
          updateErrorDisplay();
          file.on('op', function(op) {
            var optype = op[0].p[0];
            if (optype == 'text') {
              updateTypingDisplay();
              updateMatchDisplay();
	    } else if (optype == 'markers') {
              updateErrorDisplay();
            }
          });
        });
      });
    });
  });
  
  deduplicate();
}

function findLineForIndex(text, index) {
  var lines = text.split('\n');
  var length = 0;
  var lineindex = 0;
  while (length <= index) {
    length += lines[lineindex].length + 1;
    lineindex++;
  }
  return lines[lineindex - 1];
}

function deduplicate() {
  var seen = {};
  Array.prototype.slice.call(document.querySelector('#collabs').children).forEach(function(item) {
    var users = item.dataset.users.split(',');
    var unseen = users.filter(function(user) { return ! seen[user]; });
    if ( ! unseen.length) {
      document.querySelector('#dupes-header').classList.remove('hidden');
      document.querySelector('#dupes').appendChild(item);
      return;
    }
    users.forEach(function(user) { seen[user] = true; });
  });
}
