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
  document.querySelector('#scratch-title').setAttribute('data-fileid', collabid + '-' + scratchpath);
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

var filelist = document.querySelector('#files');
var files = connection.createSubscribeQuery('files', { collabid: collabid }, {});
var allsubs = [];
files.on('ready', function() {
  var subs = connection.createSubscribeQuery('subs', { username: authusername }, {});
  subs.on('ready', function() { updateAllSubs(subs.results); });
  subs.on('insert', updateAllSubs);
  subs.on('remove', updateSubs);
  updateFiles();
});
files.on('changed', updateFiles);

function updateFiles() {
  filelist.innerHTML = '';
  files.results.filter(function(file) {
    return file && file.data && file.data.filepath !== scratchpath;
  }).forEach(function(file) {
    var item = document.createElement('h4');
    item.setAttribute('data-fileid', file.id);
    item.textContent = file.data.filepath;
    item.appendChild(document.createElement('small'));
    var item = filelist.appendChild(item);
  });
  updateSubs();
}

function updateAllSubs(subs) {
  subs.forEach(function(sub) {
    sub.subscribe(function(err) {
      if (err) { throw err; }
      allsubs.push(sub);
      updateSubs();
      sub.on('op', updateSubs);
    });
  });
}

function updateSubs() {
  document.querySelectorAll('[data-fileid] small').forEach(function(item) {
    item.innerHTML = '';
  });
  
  allsubs.forEach(function(sub) {
    if ( ! sub.data) { return; }
    sub.data.files.forEach(function(fileid) {
      var item = document.querySelector('[data-fileid="' + fileid + '"]');
      if ( ! item) { return; }
      var connections = item.querySelector('small');
      var elt = document.createElement('div');
      elt.classList.add('subscription');
      if (sub.data.useragent.startsWith('Jetty/')) {
        elt.classList.add('subscription-eclipse');
      } else {
        elt.classList.add('subscription-self');
      }
      elt.textContent = 'connected';
      connections.appendChild(elt);
    });
  });
}
