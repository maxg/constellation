var connection = new window.sharedb.Connection(new WebSocket(shareURL));

var collabs = connection.createSubscribeQuery('collabs', {
  project: project,
  $sort: { '_m.ctime': -1 }
}, {});

collabs.on('ready', function() { addCollabs(collabs.results, 0); });
collabs.on('insert', addCollabs);

function addCollabs(collabs, atIndex) {
  var map = document.querySelector('#map');
  collabs.forEach(function(collab, idx) {
    var item = document.importNode(document.querySelector('#collab').content, true);
    var root = item.querySelector('.collab');
    root.id = 'collab-' + collab.id;
    if (collab.data.location) {
      root.classList.add('positioned');
      root.style.left = 'calc(' + (100 * collab.data.location.seatX) + '% - 5px)';
      root.style.top = 'calc(' + (100 * collab.data.location.seatY) + '% - 5px)';
    }
    map.insertBefore(item, map.querySelectorAll('.collab')[atIndex + idx]);

    collab.subscribe(function() {
      updateCollab(collab);
      collab.on('op', function() {
        updateCollab(collab);
      });
    });
  });
}

function updateCollab(collab) {
  let root = document.querySelector('#collab-' + collab.id);
  let users = collab.data.users.slice().sort();
  root.title = users.join(', ');

  deduplicate();
}

function deduplicate() {
  var seen = {};
  collabs.results.forEach(function(collab) {
    var item = document.querySelector('#collab-' + collab.id);
    var users = collab.data.users;
    var unseen = users.filter(function(user) { return !seen[user]; });
    item.classList.toggle('duplicate', unseen.length == 0);
    users.forEach(function(user) { seen[user] = true; });
  });
}
