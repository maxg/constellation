var connection = new window.sharedb.Connection(new WebSocket(shareURL));

var collab = connection.get('collabs', collabid);
collab.fetch(function(err) {
  if (err) { throw err; }
  
  document.querySelector('#project').textContent = 'for ' + collab.data.project;
  
  var user = connection.get('users', authusername);
  user.subscribe(function(err) {
    if (err) { throw err; }
    
    user.on('op', function() {
      if (user.data.collabs[0] !== collabid) {
        document.querySelector('#error').textContent = 'this collaboration is no longer current, please reload the page';
      }
    });
  });
  
  setupScratch();
});

var scratcharea = document.querySelector('#scratch');
var scratchpath = 'lab-scratchpad';

function setupScratch() {
  var scratchdoc = connection.get('files', collabid + '-' + scratchpath);
  scratchdoc.on('create', function(created) { updateScratch(); });
  scratchdoc.subscribe(updateScratch);
  
  function updateScratch(err) {
    if (err) { throw err; }
    if ( ! scratchdoc.type) {
      return scratchdoc.create({
        collabid: collabid,
        project: collab.data.project,
        filepath: scratchpath,
        text: '',
      }, function(err) {
        if (err && err.code !== 4016) { throw err; }
      });
    }
    var binding = new window.sharedb.StringBinding(scratcharea, scratchdoc, [ 'text' ]);
    binding.setup();
  }
}

var files = connection.createSubscribeQuery('files', { collabid: collabid }, {});
files.on('ready', updateFiles);
files.on('insert', updateFiles);

function updateFiles() {
  var list = document.querySelector('#files');
  while (list.firstChild) { list.removeChild(list.firstChild); }
  files.results.filter(function(file) {
    return file && file.data && file.data.filepath !== scratchpath;
  }).forEach(function(file) {
    var item = list.appendChild(document.createElement('h4'));
    item.textContent = file.data.filepath;
  });
}
