var connection = new window.sharedb.Connection(new WebSocket(shareURL));

var pings = connection.get('pings', project);
pings.subscribe(function() {
  if (pings.type) {
    createPings();
  } else {
    pings.on('create', createPings);
  }
});
pings.on('op', function(op) {
  if (op.length === 0) { return; }
  if (op.length > 1) { throw new Error('op with multiple components'); }
  var component = op[0];
  if (component.p[0] === 'collabs' && component.li) {
    updatePing(component.li, component.p[1]);
  }
});

var checkoffs = connection.createSubscribeQuery('checkoffs', {
  project: project,
  milestone: milestone,
}, {});

function createPings() {
  var list = document.querySelector('#pings');
  pings.data.collabs.forEach(function(collab, idx) {
    var item = document.importNode(document.querySelector('#collab').content, true);
    
    var link = item.querySelector('.users');
    link.addEventListener('click', function(event) {
      reveal(idx);
      event.preventDefault();
    });
    
    var scorechoice = $('input[name="score"]', item);
    scorechoice.change(function() {
      setCheckoff(idx);
    });
    
    list.appendChild(item);
    
    updatePing(collab, idx);
  });
  
  if (checkoffs.ready) {
    applyCheckoffs(checkoffs.results);
  } else {
    checkoffs.on('ready', function() { applyCheckoffs(checkoffs.results); });
  }
  checkoffs.on('insert', applyCheckoffs);
}

function updatePing(collab, idx) {
  var item = document.querySelector('#pings').children[idx];
  item.classList.remove('faded');
  item.querySelector('.score').classList.add('invisible');
  
  item.dataset.collabid = collab && collab.collabid;
  var link = item.querySelector('.users');
  link.textContent = collab && collab.users.slice().sort().join('\n');
  
  var buttons = item.querySelectorAll('.score .btn');
  buttons.forEach(function(button) {
    button.classList.remove('active');
  });
  
  var checkoff = collab && checkoffs.ready && checkoffs.results.find(function(checkoff) {
    return checkoff.data.collabid === collab.collabid;
  });
  if (checkoff && checkoff.data.score !== null) {
    buttons[checkoff.data.score].classList.add('active');
  }
  item.querySelector('.grader').textContent = checkoff && checkoff.data.grader;
  
  void item.offsetWidth; // trigger reflow so CSS animation will restart
  item.classList.add('faded');
}

function reveal(idx) {
  var item = document.querySelector('#pings').children[idx];
  item.classList.remove('faded');
  item.querySelector('.score').classList.remove('invisible');
}

function applyCheckoffs(checkoffs) {
  checkoffs.forEach(function(checkoff) {
    checkoff.on('op', function() { updateCheckoff(checkoff); });
    updateCheckoff(checkoff);
  });
}

function updateCheckoff(checkoff) {
  var item = document.querySelectorAll('#pings [data-collabid="' + checkoff.data.collabid + '"]').forEach(function(item) {
    var buttons = item.querySelectorAll('.score .btn');
    buttons.forEach(function(button) {
      button.classList.remove('active');
    });
    if (checkoff.data.score !== null) {
      buttons[checkoff.data.score].classList.add('active');
    }
    item.querySelector('.grader').textContent = checkoff.data.grader;
  });
}

function setCheckoff(idx) {
  var item = document.querySelector('#pings').children[idx];
  var comment = '[in-person checkoff]';
  var score = $('.score .btn', item).index($('.score .btn.active', item));
  var checkoff = connection.get('checkoffs', item.dataset.collabid + '-' + milestone);
  checkoff.fetch(function(err) {
    if (err) { throw err; }
    if ( ! checkoff.type) {
      checkoff.create({
        collabid: item.dataset.collabid,
        project: project,
        milestone: milestone,
        cutoff: null,
        modified: moment().toLocal(),
        grader: authusername,
        comment: comment,
        score: score
      }, function(err) {
        if (err && err.code !== 4016) { throw err; }
      });
    } else {
      checkoff.submitOp({ p: ['modified'], od: checkoff.data.modified, oi: moment().toLocal() });
      if (checkoff.data.comment.indexOf(comment) < 0) {
        checkoff.submitOp({ p: ['comment', 0], si: comment + (checkoff.data.comment.length ? ' ' : '') });
      }
      checkoff.submitOp({ p: ['score'], od: checkoff.data.score, oi: score });
      checkoff.submitOp({ p: ['grader'], od: checkoff.data.grader, oi: authusername });
    }
  });
}
