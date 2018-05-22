var checkoff = connection.get('checkoffs', collabid + '-' + milestone);
checkoff.once('create', function(created) { setupCheckoff(); });
checkoff.subscribe(setupCheckoff);

function setupCheckoff(err) {
  if (err) { throw err; }
  if ( ! checkoff.type) {
    return checkoff.create({
      collabid: collabid,
      project: project,
      milestone: milestone,
      cutoff: cutoff,
      modified: moment().toLocal(),
      grader: authusername,
      comment: '',
      score: null
    }, function(err) {
      if (err && err.code !== 4016) { throw err; }
    });
  }
  
  var commentfield = document.querySelector('#comment');
  (new window.sharedb.StringBinding(commentfield, checkoff, [ 'comment' ])).setup();
  commentfield.addEventListener('input', setGrader);
  
  var scorechoice = $('input[name="score"]');
  scorechoice.change(function() {
    setScore($('#score .btn').index($('#score .btn.active')));
  });

  // set up keyboard shortcut for scores;
  // focus on comment box after selecting score
  $(window).keypress(function(e) {
    var keyscoremap = {
      49: 0, // '1'
      50: 1, // '2'
      51: 2  // '3'
    };

    var keycode = e.keyCode || e.which;
    if (keycode in keyscoremap
          && !$('#comment').is(':focus')) {
      setScore(keyscoremap[keycode]);
      updateScore();

      $('#comment').focus().select();

      e.stopPropagation();
      return false;
    }
  });
  
  updateScore();
  updateGrader();
  
  checkoff.on('op', function(op, source) {
    if (source) { return; } // local op, ignore
    if (op.length === 0) { return; }
    if (op.length > 1) { throw new Error('op with multiple components'); }
    var component = op[0];
    if (component.p[0] === 'score') { updateScore(); }
    if (component.p[0] === 'grader') { updateGrader(); }
  });
}

function setScore(score) {
  if (checkoff.data.cutoff !== cutoff) {
    checkoff.submitOp({ p: ['cutoff'], od: checkoff.data.cutoff, oi: cutoff });
  }
  checkoff.submitOp({ p: ['modified'], od: checkoff.data.modified, oi: moment().toLocal() });
  checkoff.submitOp({ p: ['score'], od: checkoff.data.score, oi: score });
  setGrader();
}

function updateScore() {
  var buttons = $('#score .btn').removeClass('active');
  if (checkoff.data.score !== null) {
    buttons.get(checkoff.data.score).classList.add('active');
  }
}

function setGrader() {
  if (checkoff.data.grader == authusername) { return; }
  checkoff.submitOp({ p: ['grader'], od: checkoff.data.grader, oi: authusername });
  updateGrader();
}

function updateGrader() {
  document.querySelector('#grader').textContent = checkoff.data.grader;
}
