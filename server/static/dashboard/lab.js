var connection = new window.sharedb.Connection(new WebSocket(shareURL));

var user = connection.get('users', username);
user.subscribe(function(err) {
  if (err) { throw err; }
  
  if ( ! (user && user.data && user.data.collabs.length)) {
    document.querySelector('#error').textContent = username + ' has no current collaboration';
    return;
  }
  var collabid = user.data.collabs[0];
  var collab = connection.get('collabs', collabid);
  collab.fetch(function(err) {
    if (err) { throw err; }
    
    if (collab.data.project !== project) {
      document.querySelector('#error').textContent = username + ' last collaborated on ' + collab.data.project;
      return;
    }
    user.on('op', function() {
      if (user.data.collabs[0] !== collabid) {
        document.querySelector('#error').textContent = 'this collaboration is no longer current, please reload the page';
      }
    });
    
    var files = connection.createSubscribeQuery('files', { collabid: collabid }, {});
    files.on('ready', function() { insertFiles(files.results, 0); });
    files.on('insert', insertFiles);
  });
});

var scratcharea = document.querySelector('#scratch');
var scratchpath = 'lab-scratchpad';
var scratchconnections = document.querySelector('#scratch-connections');

function insertFiles(files, atIndex) {
  var list = document.querySelector('#files');
  
  var skip = 0;
  files.forEach(function(file, idx) {
    if (file.data.filepath === scratchpath) {
      file.subscribe(function(err) {
        if (err) { throw err; }
        var binding = new window.sharedb.StringBinding(scratcharea, file, [ 'text' ]);
        binding.setup();
      });
      var subs = connection.createSubscribeQuery('subs', { files: file.id });
      subs.on('ready', function() { updateSubs(scratchconnections, subs.results) });
      subs.on('changed', function() { updateSubs(scratchconnections, subs.results) });
      skip++;
      return;
    }
    
    var item = document.importNode(document.querySelector('#file').content, true);
    var heading = item.querySelector('h4');
    var code = item.querySelector('.code code');
    var connections = item.querySelector('h4 small');
    heading.insertBefore(document.createTextNode(file.data.filepath), heading.children[0]);
    list.insertBefore(item, list.children[atIndex + idx - skip]);
    
    file.subscribe(function() {
      updateCode(code, file.data);
      file.on('op', function() { updateCode(code, file.data); });
    });
    
    var subs = connection.createSubscribeQuery('subs', { files: file.id });
    subs.on('ready', function() { updateSubs(connections, subs.results) });
    subs.on('changed', function() { updateSubs(connections, subs.results) });
  });
}

function updateCode(node, data) {
  node.innerHTML = '';
  var offset = 0;
  data.text.split('\n').forEach(function(line) {
    var elt = document.createElement('div');
    elt.classList.add('code-line');
    elt.setAttribute('data-offset', offset);
    elt.textContent = line.replace(/\r$/, '') + '\n';
    offset += line.length + 1;
    node.appendChild(elt);
  });
  Object.values(data.markers).forEach(function(markers) {
    markers.forEach(function(marker) {
      var elt = node.children[marker.lineNumber - 1];
      elt.classList.add('code-marker-' + marker.severity);
      elt.setAttribute('title', marker.message.replace(/"/g, "'"));
    });
  });
  var deletion = op && op.find(function(op) { return op.p[0] === 'text' && op.sd; });
  Object.values(data.cursors).forEach(function(cursor) {
    var offset = cursor[0] - (deletion && deletion.p[1] < cursor[0] ? deletion.sd.length : 0);
    for (var ii = 0; ii < node.children.length; ii++) {
      if (ii+1 >= node.children.length || node.children[ii+1].getAttribute('data-offset') > offset) {
        node.children[ii].classList.add('code-cursor-line');
        return;
      }
    }
  });
  hljs.highlightBlock(node);
}

function updateSubs(node, results) {
  node.innerHTML = '';
  results.forEach(function(result) {
    var elt = document.createElement('div');
    elt.classList.add('subscription');
    if (result.data.useragent.startsWith('Jetty/')) {
      elt.classList.add('subscription-eclipse');
    }
    elt.textContent = result.data.username;
    node.appendChild(elt);
  });
}
