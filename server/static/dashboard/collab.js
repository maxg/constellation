var connection = new window.sharedb.Connection(new WebSocket(shareURL));

var collab = connection.get('collabs', collabid);
collab.fetch(function(err) {
  if (err) { throw err; }
  
  document.querySelector('#partners').textContent = collab.data.users.slice().sort().join(' & ')
});

connection.createFetchQuery('files', { collabid: collabid }, {}, function(err, files) {
  if (err) { throw err; }
  
  // Example for using the visual parameter to show different visualizations
  if (visual[0] == '1') {
    // Visual 1 might require a threshold, so format of param is:
    // 1:1000 if we want visual 1 with threshold 1000
    // 1 if we want the default threshold
    // 1:2 for a threshold of 2, etc.
    var threshold = null;
    if (visual.length > 2) {
      threshold = visual.substring(2);
    }
    showFiles_visual1(files, threshold);
  } else if (visual[0] == '2') {
    // Visual 2 indicates regexes, and looks like this:
    // '2:@Override' searches for ''@Override' in the files
    // '2:@Override;;void;;size' searches for '@Override', 'void', and 'size' in the file
    // '2' searches for nothing
    var regexes = null;
    if (visual.length > 2) {
      regexes = visual.substring(2);
    }
    showFiles_general(files, updateDiff_visual2, [regexes]);
  } else {
    showFiles_general(files, updateDiff_basic, []);
  }
});

function showFiles_general(files, updateFunction, extraArgs) {
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
          updateFunction(diff, baseline, historical.data ? historical.data.text : undefined, file, extraArgs);
        }).fail(function(req, status, err) {
          diff.textContent = 'Error fetching code: ' + errorToString(req.responseJSON, status, err);
        });
      } else {
        file.subscribe(function() {
          updateFunction(diff, baseline, file.data.text, file, extraArgs);
          file.on('op', function() {
            updateFunction(diff, baseline, file.data.text, file, extraArgs);
          });
        });
      }
    }).fail(function(req, status, err) {
      diff.textContent = 'Error fetching baseline: ' + errorToString(req.responseJSON, status, err);
    });

  });
}

/** Visual 1: Total diff */
function showFiles_visual1(files, threshold) {
  // TODO: Also do the subscribe thing

  var list = document.querySelector('#files');
  files.sort(function(a, b) { return a.data.filepath.localeCompare(b.data.filepath); });
  files.forEach(function(file) {



    var url = '/ops/' + project + '/' + collabid + '/' + file.data.filepath
      + (cutoff ? '?cutoff=' + cutoff : '')
      + (threshold ? (cutoff ? '&threshold=' + threshold
                             : '?threshold=' + threshold)
                   : '');

    $.ajax(url).done(function(diff) {
      var item = document.importNode(document.querySelector('#file').content, true);
      var heading = item.querySelector('h4');
      heading.textContent = file.data.filepath;
      var codeBlock = item.querySelector('.diff code');
      list.appendChild(item);

      diff.forEach(function(part){
        var elt = document.createElement('span');

        if (part.added) {
          elt.classList.add('span-added');
        } else if (part.removed) {
          elt.classList.add('span-removed');
          if (part.original) {
            elt.classList.add('span-original');
          }
        } else {
          elt.classList.add('span-original');
        }

        elt.appendChild(document.createTextNode(part.value));
        codeBlock.appendChild(elt);
      });

      // TODO: Add syntax highlighting?
      // TODO: Make green less bright

    }).fail(function(req, status, err) {
      list.textContent = 'Error fetching ops: ' + errorToString(req.responseJSON, status, err);
    });

  });

}

/**
 * Update the diffs for the basic visualization.
 */
function updateDiff_basic(node, baseline, text, file, extraArgs) {
  if (baseline === undefined || text === undefined) { return; }
  node.innerHTML = '';
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
}

/**
 * Update the diffs for visualization 2: regex matching.
 */
function updateDiff_visual2(node, baseline, text, file, extraArgs) {
  var regexes = extraArgs[0];

  console.log('updatediffvisual2');
  console.log(regexes);
  if (baseline === undefined || text === undefined) { return; }
  node.innerHTML = '';

  if (!regexes) {
    // TODO: Make more DRY w/ else code
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

  } else {
    var cutoffUrlPart = cutoff ? '/' + cutoff : '';
    // ';;' is used as the delimiter between regexes
    //regexes = '%5C%28.%2A%5C%29'; // \(.*\)
    $.ajax('/regex/' + collabid + '/' + regexes + cutoffUrlPart + '/f/' + file.data.filepath).done(function(regexesJson) {
      console.log(regexesJson);
      var regexesMap = new Map(JSON.parse(regexesJson));

      // Keep track of the current line number we're on
      // TODO: -1 doesn't seem right
      var currentLineNumber = 1;

      // Calculate the diff and highlight it correctly
      window.diff.diffLines(baseline.trim(), text.trim()).forEach(function(part) {
        var partLines = part.value.split('\n');
        // Last one is always an empty string
        partLines.pop();

        //console.log(partLines);
        //console.log(part);
        for (var i = 0; i < partLines.length; i++) {
          var partLine = partLines[i];

          var elt = document.createElement('div');
          elt.classList.add('diff-part');

          // A removed part doesn't count toward the line numbers
          if (part.removed) {
            elt.classList.add('diff-removed');
            node.appendChild(elt);
            //currentLineNumber += 1;
            continue;
          }
          if (part.added) {
            elt.classList.add('diff-added');
          }

          if (regexesMap.has(currentLineNumber)) {

            var endOfLastRegex = 0;
            regexesMap.get(currentLineNumber).forEach(function(match) {
              if (endOfLastRegex > match.indexInLine) {
                // The regexes overlapped (e.g. 'Stream' and 'a')
                // Ignore this regex
                // TODO: Better handling of this case?
                //   Probably won't happen that much?

                // TODO: What if the regex that's first in the line
                //   came last
                
                return;
              }

              // TODO: Make more DRY

              var beforeRegexElt = document.createElement('span');
              var regexElt = document.createElement('span');
              var afterRegexElt = document.createElement('span');

              beforeRegexElt.appendChild(document.createTextNode(
                partLine.substring(endOfLastRegex, match.indexInLine)));
              regexElt.appendChild(document.createTextNode(
                partLine.substring(match.indexInLine, match.indexInLine + match.length)));
              afterRegexElt.appendChild(document.createTextNode(
                partLine.substring(match.indexInLine + match.length)));

              regexElt.classList.add('diff-regex');

              if (endOfLastRegex > 0) {
                // Need to remove the last child, since this the three elts
                // created here represent the same characters as the last child
                elt.removeChild(elt.lastChild);
              }

              elt.appendChild(beforeRegexElt);
              elt.appendChild(regexElt);
              elt.appendChild(afterRegexElt);

              endOfLastRegex = match.indexInLine + match.length;
            });

            // Add newline back in for correct syntax highlighting
            elt.lastChild.appendChild(document.createTextNode('\n'));

          } else {
            elt.classList.add('diff-part');
            if (part.added) {
              elt.classList.add('diff-added');
            }

            // Add newline back in for correct syntax highlighting
            elt.appendChild(document.createTextNode(partLine + '\n'));
          }

          node.appendChild(elt);
          currentLineNumber += 1;
        }
        
      });

      // TODO: Syntax highlighting doesn't work anymore
      hljs.highlightBlock(node);

      
      
    }).fail(function(req, status, err) {
      console.log("got regex error");
      console.log(err);
    });
  }
}


function errorToString(json, status, err) {
  return (json && json.code || status) + ' ' + (json && json.message || err);
}
