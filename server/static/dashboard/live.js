// augmented diffLines which outputs each line as a separate part
function diffLines(baseline, current) {
  // ensure both text blocks end in newline
  if (baseline[baseline.length - 1] != '\n') baseline += '\n';
  if (current[current.length - 1] != '\n') current += '\n';

  var parts = [];
  window.diff.diffLines(baseline, current).forEach(function(part) {
    var lines = part.value.split('\n');
    // remove final empty element, since each part ends in newline
    lines = lines.slice(0, lines.length - 1);
    lines.forEach(function(line) {
      parts.push({ added: part.added, removed: part.removed, value: line });
    });
  });
  return parts;
}

var listenertimeoutids = {};
// delay all listener callbacks until timeout has passed since last event
function addListenerWithTimeout(id, elt, action, timeout, callback) {
  elt.addEventListener(action, function(e) {
    clearTimeout(listenertimeoutids[id]);
    listenertimeoutids[id] = setTimeout(function() {
      callback(e);
    }, timeout);
  });
}

////////////////////////////

var queryparams = new URLSearchParams(location.search);

var condensedtoggle = document.querySelector('#condensed');
var autoscrolltoggle = document.querySelector('#autoscroll');

condensedtoggle.addEventListener('change', function() {
  document.querySelector('#collabs').classList.toggle('condensed', condensedtoggle.checked);
  document.querySelector('#dupes').classList.toggle('condensed', condensedtoggle.checked);
});

var searchbox = document.querySelector('#search');
var countdisplay = document.querySelector('#matches');

var collabstofiles = {};

var searchregex = undefined;
searchbox.addEventListener('input', function() {
  if (searchbox.value.length > 0) {
    autoscrolltoggle.checked = false;
  }
});
addListenerWithTimeout('searchbox', searchbox, 'input', 500, function() {
  searchregex = undefined;
  if (searchbox.value.length > 0) {
    try {
      searchregex = new RegExp(searchbox.value, 'i');
    } catch (e) {}
  }
  for (var collabid in collabstofiles) {
    updateMatchDisplay(collabid);
  }
});

collabs.on('ready', function() { subscribeToCollabs(collabs.results); });
collabs.on('insert', subscribeToCollabs);

function subscribeToCollabs(collabs) {
  collabs.forEach(function(collab) {
    collabstofiles[collab.id] = [];
    var files = connection.createSubscribeQuery('files', {
      collabid: collab.id,
      filepath: queryparams.has('files')
        ? { $in: queryparams.get('files').split(',') }
        : { $exists: true }
    }, {});
    files.on('ready', function() { subscribeToFiles(collab.id, files.results); });
    files.on('insert', function(newfiles) { subscribeToFiles(collab.id, newfiles); });

    var root = document.querySelector('#collab-' + collab.id);
    var images = root.querySelector('.images');
    collab.data.users.forEach(function(user) {
      var image = document.createElement('img');
      image.addEventListener('error', image.remove);
      image.src = '//web.mit.edu/lu16j/www/6.031-staff/sp18/' + user + '.jpg';
      images.appendChild(image);
    });
  });
}

function subscribeToFiles(collabid, files) {
  var root = document.querySelector('#collab-' + collabid);
  files.forEach(function(file) {
    collabstofiles[collabid].push(file);

    var item = document.importNode(document.querySelector('#file').content, true);
    item.querySelector('.file').setAttribute('id', 'file-' + collabid + '-' + file.data.filepath);
    var heading = item.querySelector('.filepath');
    heading.textContent = file.data.filepath;
    var diff = item.querySelector('.diff code');
    root.querySelector('.code').appendChild(item);

    getBaseline(file.data.filepath, function(err, baseline) {
      if (err) {
        diff.textContent = err;
        return;
      }
      file.subscribe(function() {
        root.classList.remove('disconnected');
        updateDiff(diff, baseline, file.data.text);
        updateMatchDisplay(collabid);
        updateErrorDisplay(collabid);
        file.on('op', function(ops) {
          updateDiff(diff, baseline, file.data.text);
          updateTypingDisplay(collabid);
          updateMatchDisplay(collabid);
          updateErrorDisplay(collabid);
          scrollToLatestOp(file, ops);
        });
      });
    });
  });
}


var baselines = {}; // filepath => { ajax, err, baseline }
// ensure that baseline is only fetched once per file, for all collabs
function getBaseline(filepath, callback) {
  baselines[filepath] = baselines[filepath] || {};
  var data = baselines[filepath];
  if (!data.ajax) {
    data.ajax = $.ajax('/baseline/' + project + '/' + filepath).done(function(baseline) {
      data.baseline = baseline;
    }).fail(function(req, status, err) {
      data.err = 'Error fetching baseline: ' + errorToString(req.responseJSON, status, err);
    });
  }
  data.ajax.always(function() {
    callback(data.err, data.baseline);
  });
}


function updateDiff(node, baseline, text, op) {
  if (baseline === undefined || text === undefined) { return; }
  node.innerHTML = '';
  var lineNumber = 1;
  diffLines(baseline, text).forEach(function(part) {
    if (part.removed) { return; }
    var elt = document.createElement('div');
    elt.classList.add('diff-part');
    elt.classList.add('line-' + lineNumber);
    elt.appendChild(document.createTextNode(part.value));
    if (part.added) {
      elt.classList.add('diff-added');
    }
    node.appendChild(elt);
    lineNumber++;
  });
  hljs.highlightBlock(node);
}


function updateMatchDisplay(collabid) {
  var root = document.querySelector('#collab-' + collabid);
  if (!root) { return; }

  if (searchregex) {
    var match = false;
    collabstofiles[collabid].forEach(function (file) {
      if (match) { return; }
      var matchdata = file.data.text.match(searchregex);
      if (matchdata) {
        match = true;
        var linenumber = findLineNumberForIndex(matchdata.input, matchdata.index);
        scrollToLine(collabid, file.data.filepath, linenumber);
      }
    });
    root.classList.toggle('match', match);
    countdisplay.innerHTML = document.querySelectorAll('.match').length
         + '/' + document.querySelectorAll('.collab:not(.disconnected)').length;
  } else {
    root.classList.remove('match');
  }
}


var typingtimeoutids = {};

function updateTypingDisplay(collabid) {
  var root = document.querySelector('#collab-' + collabid);
  root.classList.add('typing');
  clearTimeout(typingtimeoutids[collabid]);
  typingtimeoutids[collabid] = setTimeout(function () {
    root.classList.remove('typing');
  }, 1000);
}


var markerclasses = ['info', 'warning', 'error'];

function updateErrorDisplay(collabid) {
  var root = document.querySelector('#collab-' + collabid);
  var maxlevel = 0;
  collabstofiles[collabid].forEach(function (file) {
    for (var user in file.data.markers) {
      file.data.markers[user].forEach(function (marker) {
        maxlevel = Math.max(maxlevel, marker.severity);
      });
    }
  });
  markerclasses.forEach(function(cls) { root.classList.remove(cls); });
  root.classList.add(markerclasses[maxlevel]);
}


function scrollToLatestOp(file, ops) {
  if (!autoscrolltoggle.checked) { return; }
  if (ops.length == 0) { return; }
  // don't autoscroll when mousing over
  if (document.querySelector('#collab-' + file.data.collabid + ' .code:hover')) { return; }

  var op = ops[ops.length - 1];
  switch (op.p[0]) {
    case 'text':
      var linenumber = findLineNumberForIndex(file.data.text, op.p[1]);
      return scrollToLine(file.data.collabid, file.data.filepath, linenumber);
    case 'cursors':
      var linenumber = findLineNumberForIndex(file.data.text, op.oi[0]);
      return scrollToLine(file.data.collabid, file.data.filepath, linenumber);
  }
  // recurse until we find an op with known offset
  scrollToLatestOp(file, ops.slice(0, ops.length - 1));
}

function scrollToLine(collabid, filepath, linenumber) {
  var code = document.querySelector('#collab-' + collabid).querySelector('.code');
  var file = document.getElementById('file-' + collabid + '-' + filepath);
  code.scrollTop = file.querySelector('.line-' + linenumber).offsetTop - code.offsetTop;
}

function findLineNumberForIndex(text, index) {
  return text.substring(0, text.lastIndexOf('\n', index)).split('\n').length + 1;
}

function errorToString(json, status, err) {
  return (json && json.code || status) + ' ' + (json && json.message || err);
}
