collabs.on('ready', function() {
  var checkoffs = connection.createSubscribeQuery('checkoffs', {
    project: project,
    milestone: milestone,
  }, {});

  checkoffs.on('ready', function() { insertCheckoff(checkoffs.results, 0); });
  checkoffs.on('insert', insertCheckoff);
});

function insertCheckoff(checkoffs, atIndex) {
  checkoffs.forEach(function(checkoff, idx) {
    checkoff.on('op', function() { updateCheckoff(checkoff); });
    updateCheckoff(checkoff);
  });
}

function updateCheckoff(checkoff) {
  var item = document.getElementById('collab-' + checkoff.data.collabid);
  item.querySelector('.grader').textContent = checkoff.data.grader;
  item.querySelector('.score').innerHTML = '';
  if (checkoff.data.score !== null) {
    var score = document.importNode(document.querySelector('#score-' + checkoff.data.score).content, true);
    item.querySelector('.score').appendChild(score);
  }
}
