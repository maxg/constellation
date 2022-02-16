connection.on('state', function(state) {
  var status = document.getElementById('connection-status');
  status.classList.remove('label-success');
  status.classList.remove('label-danger');
  status.classList.remove('label-warning');
  status.textContent = state;
  switch (state) {
    case 'connected':
      status.classList.add('label-success'); break;
    case 'disconnected':
    case 'closed':
    case 'stopped':
      status.classList.add('label-danger'); break;
    default:
      status.classList.add('label-warning');
  }
});
