var connection = new window.sharedb.Connection(new WebSocket(shareURL));

var collab = connection.get('collabs', collabid);
collab.fetch(function(err) {
  if (err) { throw err; }
  
  document.querySelector('#partners').textContent = collab.data.users.slice().sort().join(' & ')
});

connection.createFetchQuery('files', { collabid: collabid }, {}, function(err, files) {
  if (err) { throw err; }

  if (!visual) {
    showFiles(files, updateDiff_basic, {});

  } else if (visual[0] == '1') {
    // Visual 1 indicates a total diff visualiation
    // "1threshold=1000" if we want visual 1 with threshold 1000
    // "1" if we want the default threshold
    // "1threshold=2" for a threshold of 2, etc.
    var threshold = null;
    var beginningOfThreshold = visual.indexOf("threshold=");
    if (beginningOfThreshold != -1) {
      threshold = visual.substring(beginningOfThreshold + "threshold=".length);
    }

    addButtonToHideDeletedCode();
    showFiles(files, updateDiff_visual1_deletesOnSide, {"threshold": threshold});

  } else if (visual[0] == '2') {
    // Visual 2 indicates regexes, and looks like this:
    // "2regexes=Override" searches for ''@Override' in the files
    // "2regexes=@Override;;void;;size" searches for '@Override', 'void', and 'size' in the file
    // "2" searches for nothing
    var regexes = '';
    var beginningOfRegexes = visual.indexOf("regexes=");
    if (beginningOfRegexes != -1) {
      regexes = visual.substring(beginningOfRegexes + "regexes=".length);
    }

    showFiles(files, updateDiff_visual2, {"regexes": regexes});

  } else if (visual[0] == '3') {
    // Visual 3 indicates regexes and total diff view combined
    // Possible formats of visual:
    // "3regexes=\(.*\);;String"
    // "3threshold=1000regexes=String"
    // "3threshold=500"
    // "3"
    // Not allowed:
    // "3regexes=Stringthreshold=1000"

    var threshold = null;
    var regexes = '';

    var beginningOfRegexes = visual.indexOf("regexes=");
    var beginningOfThreshold = visual.indexOf("threshold=");
    if (beginningOfThreshold != -1 && beginningOfRegexes != -1) {
      threshold = visual.substring(beginningOfThreshold + "threshold=".length, beginningOfRegexes);
    } else if (beginningOfThreshold != -1) {
      threshold = visual.substring(beginningOfThreshold + "threshold=".length);
    }

    if (beginningOfRegexes != -1) {
      regexes = visual.substring(beginningOfRegexes + "regexes=".length);
    }

    addButtonToHideDeletedCode();
    showFiles(files, updateDiff_visual3, {'threshold': threshold, 'regexes': regexes});

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
    var item = document.importNode(document.querySelector('#file').content, true);
    var heading = item.querySelector('h4');
    heading.textContent = file.data.filepath;
    var diff = item.querySelector('.diff code');
    list.appendChild(item);

    $.ajax('/baseline/' + project + '/' + file.data.filepath).done(function(baseline) {
      var extraArgsForFile = Object.assign({'filepath': file.data.filepath}, extraArgs);

      if (cutoff) {
        $.ajax('/historical/' + project + '/' + collabid + '/' + file.data.filepath + '/' + cutoff).done(function(historical) {

          updateFunction(diff, baseline, historical.data ? historical.data.text : undefined, extraArgsForFile);

        }).fail(function(req, status, err) {
          diff.textContent = 'Error fetching code: ' + errorToString(req.responseJSON, status, err);
        });
      } else {
        file.subscribe(function() {
          updateFunction(diff, baseline, file.data.text, extraArgsForFile);
          file.on('op', function(op) {
            extraArgs["op"] = op;
            updateFunction(diff, baseline, file.data.text, extraArgsForFile);
          });
        });
      }
    }).fail(function(req, status, err) {
      diff.textContent = 'Error fetching baseline: ' + errorToString(req.responseJSON, status, err);
    });

  });
}

////////////////////////////////////
///////// UPDATE FUNCTIONS /////////

/*
 * Update the diffs for the basic visualization.
 */
function updateDiff_basic(node, baseline, text, file, extraArgs) {
  drawNormalDiff(baseline, text, node);
}

/** 
 * Update the diffs using visual 1.
 * Visual 1: A total diff view, that includes some code history
 */
function updateDiff_visual1(node, baseline, text, extraArgs) {
  if (baseline === undefined || text === undefined) { return; }

  var filepath = extraArgs["filepath"];
  var threshold = extraArgs["threshold"];
  var url = getAjaxUrlForTotalDiff(filepath, threshold);

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

  }).fail(function(req, status, err) {
    list.textContent = 'Error fetching total diff: ' + errorToString(req.responseJSON, status, err);
  });
}

/** 
 * Update the diffs using visual 1.
 * Visual 1: A total diff view, that includes some code history
 * This visualiation moves the deleted code to the right, keeping only final code on the left.
 */
function updateDiff_visual1_deletesOnSide(node, baseline, text, extraArgs) {
  if (baseline === undefined || text === undefined) { return; }

  var filepath = extraArgs["filepath"];
  var threshold = extraArgs["threshold"];
  var url = getAjaxUrlForTotalDiff(filepath, threshold);

  $.ajax(url).done(function(diff) {

    // TODO: Revert to old visualization if the window is too small

    addTotalDiffDeletesOnSideDom(diff, node);

    // TODO: Add syntax highlighting?

  }).fail(function(req, status, err) {
    list.textContent = 'Error fetching total diff: ' + errorToString(req.responseJSON, status, err);
  });
}

 /** 
 * Update the diffs using visual 2.
 * Visual 2: Highights regexes.
 */
function updateDiff_visual2(node, baseline, text, extraArgs) {
  drawNormalDiff(baseline, text, node);
  var regexes = extraArgs["regexes"];
  addRegexHighlighting(node, regexes);
  // TODO: Without regex matching, the entire line is highlighted
  //   in light yellow if the student added that code.
  // However, now only the part of the line with code on it is
  //   highlighted.

  // TODO: Syntax highlighting doesn't work here
}

/** 
 * Update the diffs using visual 3.
 * Visual 3: Combination of total diff (visual 1 with deletes on side)
 *   and regex highlighting (visual 2)
 */
function updateDiff_visual3(node, baseline, text, extraArgs) {
  if (baseline === undefined || text === undefined) { return; }

  var filepath = extraArgs["filepath"];
  var threshold = extraArgs["threshold"];
  var url = getAjaxUrlForTotalDiff(filepath, threshold);

  $.ajax(url).done(function(diff) {
    // TODO: Revert to old visualization if the window is too small
    var divs = addTotalDiffDeletesOnSideDom(diff, node);

    var regexes = extraArgs["regexes"];
    divs.forEach(function(div) {
      addRegexHighlighting(div, regexes);
    });

    // TODO: Add syntax highlighting?

  }).fail(function(req, status, err) {
    list.textContent = 'Error fetching total diff: ' + errorToString(req.responseJSON, status, err);
  });
}

//////////////////////////////////
///////// HELPER METHODS /////////

/* Given a node containing each line of code and the regexes
 *  to match, update the DOM so that the regexes are
 *  highlighted in yellow. */
function addRegexHighlighting(node, regexes) {
  var regexesSplit = regexes.split(';;');
  if (regexesSplit.length == 1 && regexesSplit[0] == '') {
    // No regexes given
    return;
  }

  regexesSplit.forEach(function(regex) {
    // 'g' flag means it finds all matches, not just the first one
    var regexp = RegExp(regex, 'g');
    var newChildNodes = [];

    node.childNodes.forEach(function(child) {
      var regexesList = [];

      var stringToCheck = child.innerText;
      var myArray;
      while ((myArray = regexp.exec(stringToCheck)) !== null) {
        var regexLocation = {
          'indexInLine': myArray['index'],
          'length': myArray[0].length,
        };
        regexesList.push(regexLocation);
      }

      var newChildren = addRegexHighlighting_success2(child, regexesList, node, stringToCheck);
      newChildNodes = newChildNodes.concat(newChildren);
    });

    // Remove the old children and add the new ones
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }

    newChildNodes.forEach(function(child) {
      node.appendChild(child);
    });
  });
}

function addRegexHighlighting_success2(elt, regexesList, parentElt, text) {
  // Don't highlight regexes on original code
  if ($(elt).hasClass('span-original') || $(elt).hasClass('diff-original')) {
    return [elt];
  }

  if (regexesList.length == 0) {
    return [elt];
  }

  var classesToAdd = $(elt).attr('class');


  var newElts = [];
  var endOfLastRegex = 0;
  var indexInParentElt = Array.from(parentElt.children).indexOf(elt);

  regexesList.forEach(function(match) {
    var beforeRegexElt = document.createElement('span');
    var regexElt = document.createElement('span');
    var afterRegexElt = document.createElement('span');

    // Ensures that these spans still follow the same CSS rules
    // as the original
    $(beforeRegexElt).addClass(classesToAdd);
    $(regexElt).addClass(classesToAdd);
    $(afterRegexElt).addClass(classesToAdd);

    regexElt.classList.add('diff-regex');

    beforeRegexElt.appendChild(document.createTextNode(
      text.substring(endOfLastRegex, match.indexInLine)));
    regexElt.appendChild(document.createTextNode(
      text.substring(match.indexInLine, match.indexInLine + match.length)));
    afterRegexElt.appendChild(document.createTextNode(
      text.substring(match.indexInLine + match.length)));

    if (endOfLastRegex > 0) {
      // Need to remove the last child, since the three elts
      // created here represent the same characters as the last child
      newElts.pop();
    }

    newElts.push(beforeRegexElt);
    newElts.push(regexElt);
    newElts.push(afterRegexElt);

    // Increment index of last regex so we know where to split
    // if there's another regex in the element
    endOfLastRegex = match.indexInLine + match.length;

  });

  return newElts;
}

/** Adds regex highlighting to DOM on a successful ajax call. */
function addRegexHighlighting_success(elt, regexesMap) {
  // Don't highlight regexes on original code
  if ($(elt).hasClass('span-original') || $(elt).hasClass('diff-original')) {
    return;
  }

  var eltText = elt.innerText;
  var partLines = eltText.split('\n');
  // Last one is always an empty string
  partLines.pop();

  // Empty elt so that we can add back each line individually
  elt.innerText = "";

  // Go through the lines in the part and highlight the regex(es)
  for (var lineNumber = 1; lineNumber < partLines.length + 1; lineNumber++) {
    var partLine = partLines[lineNumber - 1];

    if (regexesMap.has(lineNumber)) {
      var endOfLastRegex = 0;

      // Sort by indexInLine so that {endOfLastRegex} only increases
      regexesMap.get(lineNumber).sort(function(a, b) {
        return a.indexInLine - b.indexInLine;
      });

      regexesMap.get(lineNumber).forEach(function(match) {
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

        // Ensures that these spans still follow the same CSS rules
        // as their parent
        $(beforeRegexElt).addClass($(elt).attr('class'));
        $(regexElt).addClass($(elt).attr('class'));
        $(afterRegexElt).addClass($(elt).attr('class'));

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
      // No regex match, so just put the line back in as normal
      // Add newline back in for correct syntax highlighting

      var newElt = document.createElement('span');
      $(newElt).addClass($(elt).attr('class'));
      newElt.appendChild(document.createTextNode(partLine + '\n'));
      elt.appendChild(newElt);
    }
  }

  // Remove styling from elt so that the colors don't appear twice
  elt.className = '';
}

/** Gets the ajax URL needed if you want to get the total diff
      for the given filepath */
function getAjaxUrlForTotalDiff(filepath, threshold) {
  var url = '/ops/' + project + '/' + collabid + '/' + filepath
    + (cutoff ? '?cutoff=' + cutoff : '')
    + (threshold ? (cutoff ? '&threshold=' + threshold
                           : '?threshold=' + threshold)
                 : '');
  return url;
}

/** Adds the DOM used for visual1_deletesOnSide */
function addTotalDiffDeletesOnSideDom(diff, node) {
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

  return [divNormal, divDeleted];
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
      elt.classList.add('diff-original');
      elt.appendChild(document.createTextNode(part.value));
    }
    node.appendChild(elt);
  });
  
  hljs.highlightBlock(node);
}


function errorToString(json, status, err) {
  return (json && json.code || status) + ' ' + (json && json.message || err);
}
