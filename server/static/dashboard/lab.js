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

var tabs = document.querySelector('#file-tabs');
var panes = document.querySelector('#file-panes');

function insertFiles(files, atIndex) {
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
    
    // create tab
    var tab = document.importNode(document.querySelector('#file-tab').content, true);
    var link = tab.querySelector('a');
    link.setAttribute('href', '#file-pane-' + file.id.replace(/\W/g, '_'));
    link.querySelector('.filename').textContent = file.data.filepath;
    var connections = link.querySelector('small');
    if ( ! tabs.children.length) {
      tab.querySelector('li').classList.add('active');
    }
    tabs.insertBefore(tab, tabs.children[atIndex + idx - skip]);
    
    // create content
    var pane = document.importNode(document.querySelector('#file-pane').content, true);
    var code = pane.querySelector('.code code');
    var container = pane.querySelector('.tab-pane');
    container.setAttribute('id', 'file-pane-' + file.id.replace(/\W/g, '_'));
    if ( ! panes.children.length) {
      container.classList.add('active');
    }
    panes.appendChild(pane);
    
    file.subscribe(function() {
      updateCode(code, file.data);
      file.on('op', function(op) {
        tabs.querySelectorAll('.file-indicator').forEach(function (indicator) {
          indicator.classList.add('invisible');
        });
        link.querySelector('.file-indicator').classList.remove('invisible');
        updateCode(code, file.data, op);
      });
    });
    
    var subs = connection.createSubscribeQuery('subs', { files: file.id });
    subs.on('ready', function() { updateSubs(connections, subs.results) });
    subs.on('changed', function() { updateSubs(connections, subs.results) });
  });
}

function updateCode(node, data, op) {
  var changed = new Set(op ? op.map(function(op) { return op.p[0]; }) : [ 'all' ]);
  
  // update text, clear markers and cursors
  if (changed.has('all') || changed.has('text')) {
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
  } else {
    node.querySelectorAll('.code-line').forEach(function(line) {
      line.className = 'code-line';
    });
  }
  
  // update markers
  Object.values(data.markers).forEach(function(markers) {
    markers.forEach(function(marker) {
      var elt = node.children[marker.lineNumber - 1];
      elt.classList.add('code-marker-' + marker.severity);
      elt.setAttribute('title', marker.message.replace(/"/g, "'"));
    });
  });
  
  // update cursors
  var deletion = op && op.find(function(op) { return op.p[0] === 'text' && op.sd; });
  Object.values(data.cursors).forEach(function(cursor) {
    if (node.children.length && cursor.length === 3 && ! changed.has('text')) {
      var ii = 0;
      for ( ; ii+1 < node.children.length && node.children[ii+1].getAttribute('data-offset') < cursor[1]; ii++) {
      }
      node.children[ii].classList.add('code-cursor-line');
      for ( ; ii < node.children.length && node.children[ii].getAttribute('data-offset') < cursor[1] + cursor[2]; ii++) {
        node.children[ii].classList.add('code-cursor-line');
      }
    } else {
      var offset = cursor[0] - (deletion && deletion.p[1] < cursor[0] ? deletion.sd.length : 0);
      for (var ii = 0; ii < node.children.length; ii++) {
        if (ii+1 >= node.children.length || node.children[ii+1].getAttribute('data-offset') > offset) {
          node.children[ii].classList.add('code-cursor-line');
          return;
        }
      }
    }
  });
  
  // apply syntax highlighting
  if (changed.has('all') || changed.has('text')) {
    hljs.highlightBlock(node);
  }
}

function updateSubs(node, results) {
  node.innerHTML = '';
  results.forEach(function(result) {
    if (result.data.username === authusername && result.data.useragent === navigator.userAgent) {
      return;
    }
    var elt = document.createElement('div');
    elt.classList.add('subscription');
    if (result.data.useragent.startsWith('Jetty/')) {
      elt.classList.add('subscription-eclipse');
    }
    elt.textContent = result.data.username;
    node.appendChild(elt);
  });
}
