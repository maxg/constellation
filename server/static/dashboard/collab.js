var connection = new window.sharedb.Connection(new WebSocket(shareURL));

var collab = connection.get('collabs', collabid);
collab.fetch(function(err) {
  if (err) { throw err; }
  
  document.querySelector('#partners').textContent = collab.data.users.slice().sort().join(' & ')
});

connection.createFetchQuery('files', { collabid: collabid }, {}, function(err, files) {
  if (err) { throw err; }
  
  var list = document.querySelector('#files');
  files.sort(function(a, b) { return a.data.filepath.localeCompare(b.data.filepath); });
  files.forEach(function(file) {
    var item = document.importNode(document.querySelector('#file').content, true);
    var heading = item.querySelector('h4');
    heading.textContent = file.data.filepath;
    var diff = item.querySelector('.diff code');
    list.appendChild(item);
    
    $.ajax('/baseline/' + project + '/' + file.data.filepath).done(function(baseline) {
      if (cutoff) {
        $.ajax('/historical/' + project + '/' + collabid + '/' + file.data.filepath + '/' + cutoff).done(function(historical) {
          updateDiff(diff, baseline, historical.data ? historical.data.text : undefined, file);
        }).fail(function(req, status, err) {
          diff.textContent = 'Error fetching code: ' + errorToString(req.responseJSON, status, err);
        });
      } else {
        file.subscribe(function() {
          updateDiff(diff, baseline, file.data.text, file);
          file.on('op', function() {
            updateDiff(diff, baseline, file.data.text, file);
          });
        });
      }
    }).fail(function(req, status, err) {
      diff.textContent = 'Error fetching baseline: ' + errorToString(req.responseJSON, status, err);
    });

  });
});

// TODO: Don't need to pass in text if we get the whole file anyway
function updateDiff(node, baseline, text, file) {
  if (baseline === undefined || text === undefined) { return; }
  node.innerHTML = '';

  // Testing regex matching
  // ';;' is used as the delimiter between regexes
  var regexes = '@Overr*' + ';;' + 'void';
  $.ajax('/regex/' + collabid + '/' + file.data.filepath + '/' + regexes).done(function(allRegexesMatches) {

    var regexesList = [];

    // Fill the regexesList
    allRegexesMatches.forEach(function(singleRegexMatches) {
      var result = '';

      if (singleRegexMatches.stdout) {
        // stdout returns ASCII numbers, so convert them to strings
        singleRegexMatches.stdout.data.forEach(function(num) {
          result += String.fromCharCode(num);
        });

        var singleMatchesList = result.split('\n');
        singleMatchesList.forEach(function(singleMatch) {
          var values = singleMatch.split(':');
          if (values.length < 3) {
            // Not a legitimate match
            return;
          }
          var lineNumber = parseInt(values[0]);
          var relevantChars = values[1];
          var indices = relevantChars.split('-');
          var indexInLine = indices[0];
          // Note: If *, only includes the len of things before the *
          //   haven't tested if you have abc*xyz as the regex yet
          var lengthToHighlight = parseInt(indices[1]) - parseInt(indices[0]);

          regexesList.push({
            'lineNumber': lineNumber,
            'indexInLine': indexInLine,
            'length': lengthToHighlight
          });
        })

      } else {
        console.log("no match stdout");
      }
    });

    console.log("REGEXES LIST");
    console.log(regexesList);

    // Calculate the diff and highlight it correctly
    window.diff.diffLines(baseline.trim(), text.trim()).forEach(function(part) {
      var elt = document.createElement('div');
      elt.classList.add('diff-part');
      if (part.added) {
        elt.classList.add('diff-added');
        elt.appendChild(document.createTextNode(part.value));
      } else if (part.removed) {
        elt.classList.add('diff-removed');
      } else {
        elt.appendChild(document.createTextNode(part.value));
      }
      node.appendChild(elt);
    });
    hljs.highlightBlock(node);
    
    
  }).fail(function(req, status, err) {
    console.log("got regex error");
    console.log(err);
  });

  



}

function errorToString(json, status, err) {
  return (json && json.code || status) + ' ' + (json && json.message || err);
}
