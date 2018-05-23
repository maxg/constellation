var connection = new window.sharedb.Connection(new WebSocket(shareURL));

var collabs = connection.createSubscribeQuery('collabs', {
  project: project,
  '_m.ctime': cutoff ? { $lte: +moment(cutoff) } : { $exists: true },
  $sort: { '_m.ctime': -1 }
}, {});

collabs.on('ready', function() { insertCollabs(collabs.results, 0); });
collabs.on('insert', insertCollabs);

function insertCollabs(collabs, atIndex) {
  var list = document.querySelector('#collabs');

  collabs.forEach(function(collab, idx) {
    var item = document.importNode(document.querySelector('#collab').content, true);
    var root = item.querySelector('.collab');
    root.setAttribute('id', 'collab-' + collab.id);
    let users = collab.data.users.slice().sort();
    root.dataset.users = users.join(',');
    var link = item.querySelector('a');
    var href = '/dashboard/' + project + '/' + collab.id
      + (milestone ? '/m/' + milestone : '')
      + (cutoff ? '/' + cutoff : '')
      + (deletedCode ? '?deletedCode=' + deletedCode : '')
      + (regexes ? '?regexes=' + regexes : '')
      + (hideCommonPrefix ? '?hideCommonPrefix=' + hideCommonPrefix : '');
      // TODO: This might not be right
    // TODO: Persist visual parameters when going from specific
    //   checkoff back to dashboard
    link.setAttribute('href', href);
    link.textContent = users.join('\n');
    list.insertBefore(item, list.children[atIndex + idx]);
  });

  deduplicate();
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
