var checkoff = connection.get('checkoffs', collabid + '-' + milestone);
checkoff.once('create', function(created) { setupCheckoff(); });
checkoff.subscribe(setupCheckoff);

function setupCheckoff(err) {
  if (err) { throw err; }
  if ( ! checkoff.type) {
    document.querySelector('#score-none').classList.remove('hidden');
    return;
  }
  
  updateCheckoff();
  
  checkoff.on('op', function(op, source) {
    if (source) { return; } // local op, ignore
    if (op.length === 0) { return; }
    if (op.length > 1) { throw new Error('op with multiple components'); }
    updateCheckoff();
  });
}

function updateCheckoff() {
  if (checkoff.data.cutoff) {
    var when = document.importNode(document.querySelector('#cutoff').content, true);
    when.querySelector('.label').textContent = checkoff.data.cutoff;
  } else {
    var when = document.importNode(document.querySelector('#live').content, true);
    when.querySelector('.label').textContent = checkoff.data.modified;
  }
  document.querySelector('#when').innerHTML = '';
  document.querySelector('#when').appendChild(when);
  document.querySelector('#grader').textContent = checkoff.data.grader;
  if (checkoff.data.comment) {
    document.querySelector('#comment').textContent = checkoff.data.comment;
  }
  document.querySelectorAll('#score .label').forEach(function(score) {
    score.classList.add('disabled');
  });
  if (checkoff.data.score !== null) {
    document.querySelector('#score-' + checkoff.data.score).classList.remove('disabled');
  } else {
    document.querySelector('#score-none').classList.remove('hidden');
  }
}
