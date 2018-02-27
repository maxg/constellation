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
    addButtonToHideDeletedCode();
    showFiles(files, updateDiff_visual1_deletesOnSide, {"threshold": threshold});
  } else if (visual[0] == '2') {
    // Visual 2 indicates regexes, and looks like this:
    // '2:@Override' searches for ''@Override' in the files
    // '2:@Override;;void;;size' searches for '@Override', 'void', and 'size' in the file
    // '2' searches for nothing
    var regexes = null;
    if (visual.length > 2) {
      regexes = visual.substring(2);
    }
    showFiles(files, updateDiff_visual2, {"regexes": regexes});
  } else {
    showFiles(files, updateDiff_basic, {});
  }
});

var showDeletedCode = true;

function addButtonToHideDeletedCode() {
  $(document).ready(function() {
    var button = $('<button>Toggle display of deleted code</button>');
    $(button).insertBefore($("#files"));

    $(button).click(function() {
      showDeletedCode = !showDeletedCode;
      $('.span-removed').toggle();
    });
  });
}

function showFiles(files, updateFunction, extraArgs) {
  var list = document.querySelector('#files');
  files.sort(function(a, b) { return a.data.filepath.localeCompare(b.data.filepath); });
  files.forEach(function(file) {
    console.log("file in show_files:");
    console.log(file);
    var item = document.importNode(document.querySelector('#file').content, true);
    var heading = item.querySelector('h4');
    heading.textContent = file.data.filepath;
    var diff = item.querySelector('.diff code');
    list.appendChild(item);

    
    $.ajax('/baseline/' + project + '/' + file.data.filepath).done(function(baseline) {
      if (cutoff) {
        $.ajax('/historical/' + project + '/' + collabid + '/' + file.data.filepath + '/' + cutoff).done(function(historical) {
          // TODO: Eliminate duplicate code (here + down below, in the file.subscribe)
          (function(filepath) {
            extraArgs["filepath"] = filepath;
            updateFunction(diff, baseline, historical.data ? historical.data.text : undefined, extraArgs);
          })(file.data.filepath);

        }).fail(function(req, status, err) {
          diff.textContent = 'Error fetching code: ' + errorToString(req.responseJSON, status, err);
        });
      } else {
        file.subscribe(function() {
          (function(filepath) {
            extraArgs["filepath"] = filepath;
            updateFunction(diff, baseline, file.data.text, extraArgs);
          })(file.data.filepath);
          file.on('op', function(op) {
            (function(filepath) {
              extraArgs["filepath"] = filepath;
              extraArgs["op"] = op;
              updateFunction(diff, baseline, file.data.text, extraArgs);
            })(file.data.filepath);
          });
        });
      }
    }).fail(function(req, status, err) {
      diff.textContent = 'Error fetching baseline: ' + errorToString(req.responseJSON, status, err);
    });

  });
}

/**
 * Update the diffs for the basic visualization.
 */
function updateDiff_basic(node, baseline, text, file, extraArgs) {
  drawNormalDiff(baseline, text, node);
}

/** Update the diffs for a total diff view (includes some code history) */
function updateDiff_visual1(node, baseline, text, extraArgs) {
  var filepath = extraArgs["filepath"];

  console.log("filepath in updateDiff_visual1:");
  console.log(filepath);

  var threshold = extraArgs["threshold"];

  console.log("update function visual 1");
  if (baseline === undefined || text === undefined) { return; }

  var url = '/ops/' + project + '/' + collabid + '/' + filepath
    + (cutoff ? '?cutoff=' + cutoff : '')
    + (threshold ? (cutoff ? '&threshold=' + threshold
                           : '?threshold=' + threshold)
                 : '');

  $.ajax(url).done(function(diff) {

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
      node.appendChild(elt);

      if (!showDeletedCode && part.removed) {
        $(elt).hide();
      }

    });

    // TODO: Add syntax highlighting?
    // TODO: Make green less bright


  }).fail(function(req, status, err) {
    list.textContent = 'Error fetching total diff: ' + errorToString(req.responseJSON, status, err);
  });

}

function updateDiff_visual1_deletesOnSide(node, baseline, text, extraArgs) {
  var filepath = extraArgs["filepath"];

  console.log("filepath in updateDiff_visual1:");
  console.log(filepath);

  var threshold = extraArgs["threshold"];

  console.log("update function visual 1");
  if (baseline === undefined || text === undefined) { return; }

  var url = '/ops/' + project + '/' + collabid + '/' + filepath
    + (cutoff ? '?cutoff=' + cutoff : '')
    + (threshold ? (cutoff ? '&threshold=' + threshold
                           : '?threshold=' + threshold)
                 : '');

  $.ajax(url).done(function(diff) {

    // TODO: Revert to old visualization if the window is too small

    var divNormal = document.createElement('div');
    divNormal.classList.add('div-normal');
    divNormal.classList.add('col-xs-6');
    var divDeleted = document.createElement('div');
    divDeleted.classList.add('div-deleted');
    divDeleted.classList.add('col-xs-6');

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
      divNormal.appendChild(elt);

      elt2 = elt.cloneNode(true);
      divDeleted.appendChild(elt2);

      if (!showDeletedCode && part.removed) {
        $(elt).hide();
        $(elt2).hide();
      }

    });

    node.appendChild(divNormal);
    node.appendChild(divDeleted);

    // TODO: Add syntax highlighting?
    // TODO: Make green less bright


  }).fail(function(req, status, err) {
    list.textContent = 'Error fetching total diff: ' + errorToString(req.responseJSON, status, err);
  });

}

/**
 * Update the diffs for visualization 2: regex matching.
 */
function updateDiff_visual2(node, baseline, text, extraArgs) {
  var regexes = extraArgs["regexes"];
  var filepath = extraArgs["filepath"];

  if (!regexes) {
    drawNormalDiff(baseline, text, node);

  } else {
    if (baseline === undefined || text === undefined) { return; }
    node.innerHTML = '';

    var cutoffUrlPart = cutoff ? '/' + cutoff : '';

    // ';;' is used as the delimiter between regexes
    //regexes = '%5C%28.%2A%5C%29'; // \(.*\)
    $.ajax('/regex/' + collabid + '/' + regexes + cutoffUrlPart + '/f/' + filepath).done(function(regexesJson) {
      console.log(regexesJson);

      // Map from line number to a list of regex matches on that line number
      var regexesMap = new Map(JSON.parse(regexesJson));

      // Keep track of the current line number we're on
      var currentLineNumber = 1;

      // Calculate the diff and highlight it correctly
      window.diff.diffLines(baseline.trim(), text.trim()).forEach(function(part) {
        var partLines = part.value.split('\n');
        // Last one is always an empty string
        partLines.pop();

        // Go through the lines in the part and highlight the regex(es)
        for (var i = 0; i < partLines.length; i++) {
          var partLine = partLines[i];

          var elt = document.createElement('div');
          elt.classList.add('diff-part');

          // A removed part doesn't count toward the line numbers
          if (part.removed) {
            elt.classList.add('diff-removed');
            node.appendChild(elt);
            continue;
          }
          if (part.added) {
            elt.classList.add('diff-added');
          }


          // Highlight the regex(es) if they're there
          if (regexesMap.has(currentLineNumber)) {

            var endOfLastRegex = 0;

            // Sort by indexInLine so that {endOfLastRegex} only increases
            regexesMap.get(currentLineNumber).sort(function(a, b) {
              return a.indexInLine - b.indexInLine;
            });

            regexesMap.get(currentLineNumber).forEach(function(match) {
              if (endOfLastRegex > match.indexInLine) {
                // The regexes overlapped (e.g. 'Stream' and 'a')
                // Ignore this regex
                // TODO: Better handling of this case? Probably won't happen that much?
                return;
              }

              // Create and append HTML elements
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

              // Increment index of last regex so we know where to split
              // if there's another regex earlier in the line
              endOfLastRegex = match.indexInLine + match.length;
            });

            // Add newline back in for correct syntax highlighting
            elt.lastChild.appendChild(document.createTextNode('\n'));

          } else {
            // No regex match on this line

            // Add newline back in for correct syntax highlighting
            elt.appendChild(document.createTextNode(partLine + '\n'));
          }

          node.appendChild(elt);
          currentLineNumber += 1;
        }
        
      });

      hljs.highlightBlock(node);

      
    }).fail(function(req, status, err) {
      console.log("got regex error: " + err);
      drawNormalDiff(baseline, text, node);
    });
  }
}

/**
 * Draws a normal diff inside the node element.
 */ 
function drawNormalDiff(baseline, text, node) {
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

function errorToString(json, status, err) {
  return (json && json.code || status) + ' ' + (json && json.message || err);
}
