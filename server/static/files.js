var connection = new window.sharedb.Connection(new WebSocket(shareURL));

var collab = connection.get('collabs', collabid);
collab.fetch(function(err) {
  if (err) { throw err; }
  
  document.querySelector('#project').textContent = 'on ' + collab.data.project;
  var users = collab.data.users.filter(function(user) { return user !== authusername; });
  document.querySelector('#partners').textContent = 'with ' + users;
});

connection.createFetchQuery('files', { collabid: collabid }, {}, function(err, files) {
  if (err) { throw err; }
  
  var list = document.querySelector('#files');
  files.forEach(function(file) {
    var item = list.appendChild(document.createElement('h4'));
    var link = item.appendChild(document.createElement('a'))
    link.setAttribute('href', '/edit/' + file.data.filepath);
    link.textContent = file.data.filepath;
  });
});
