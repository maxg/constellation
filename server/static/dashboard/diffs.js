collabs.on('ready', function() {
  var files = connection.createSubscribeQuery('files', {
    project: project,
    filepath: filepath || undefined,
  }, {});
  
  files.on('ready', function() { insertFiles(files.results); });
  files.on('insert', insertFiles);
});

var baselines = {};
var scheduled = {};

function insertFiles(files) {
  files.forEach(function(file) {
    if ( ! baselines[file.data.filepath]) {
      baselines[file.data.filepath] = $.ajax('/baseline/' + project + '/' + file.data.filepath);
    }
    var parent = document.getElementById('collab-' + file.data.collabid);
    var item = document.importNode(document.querySelector('#file').content, true);
    var root = item.querySelector('.file');
    root.setAttribute('id', 'file-' + file.id);
    if ( ! filepath) {
      root.querySelector('.filename').textContent = file.data.filepath;
    }
    var diff = root.querySelector('.diff code');
    baselines[file.data.filepath].done(function(baseline) {
      file.subscribe(function() {
        updateDiff(diff, baseline, file.data.text);
        file.on('op', function(op) {
          if (op[0].p[0] === 'text') {
            scheduled[file.id] = [ diff, baseline, file.data.text ];
          }
        });
      });
    });
    parent.querySelector('.files').append(item);
  });
}

setInterval(function() {
  Object.keys(scheduled).forEach(function(id) {
    updateDiff.apply(null, scheduled[id]);
    delete scheduled[id];
  });
}, 500);

function updateDiff(node, baseline, text) {
  if (baseline === undefined || text === undefined) { return; }
  var elements = [];
  window.diff.diffLines(baseline.trim(), text.trim()).forEach(function(part) {
    var elt = document.createElement('div');
    elt.classList.add('diff-part');
    if (part.added) {
      elt.classList.add('diff-added');
      elt.append(document.createTextNode(part.value));
    } else {
      elt.append('...');
    }
    elements.push(elt);
  });
  node.innerHTML = '';
  node.append.apply(node, elements);
}
