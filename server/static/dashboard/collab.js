/////////////////////////////////////////////
///////////// GLOBAL VARIABLES //////////////

var connection = new window.sharedb.Connection(new WebSocket(shareURL));

var collab = connection.get('collabs', collabid);
collab.fetch(function(err) {
  if (err) { throw err; }
  
  document.querySelector('#partners').textContent = collab.data.users.slice().sort().join(' & ')
});

// Parameters required to use updateFunction
// TODO: Reconcile parameters and extraArgs
var parameters = {};

// Whether deleted code is currently shown or not
var showDeletedCode = false;


//////////////////////////////////////
///////////// MAIN CODE //////////////

/**
 * Fetch the files for this collab, determine which visual to use,
 *   and display the files accordingly.
 */
connection.createFetchQuery('files', { collabid: collabid }, {}, function(err, files) {
  if (err) { throw err; }

  // Visual 1: total diff
  // Visual 2: Regex matching
  // Visual 3: total diff + regex matching
  // Visual 4: total diff + hide common prefix
  // Visual 5: total diff + regex matching + hide common prefix

  if (visual[0] == '1' ||
      visual[0] == '3' ||
      visual[0] == '4' ||
      visual[0] == '5') {
    parameters["threshold"] = getThresholdFromUrl(visual);
  }  

  if (visual[0] == '2' ||
      visual[0] == '3' ||
      visual[0] == '5') {
    var regexes = getRegexesFromUrl(visual);
    parameters['regexes'] = regexes;
    regexes.forEach(function(regex) {
      addRegexToControls(regex);
    });
  }

  if (visual[0] == '4' ||
      visual[0] == '5') {
    parameters['hideCommonPrefixes'] = true;
  }

  showFiles(files, parameters);
});

/**
 * Display the files using the provided updateFunction and passing
 *   extraArgs to that updateFunction.
 */
function showFiles(files, extraArgs) {
  var list = document.querySelector('#files');
  files.sort(function(a, b) { return a.data.filepath.localeCompare(b.data.filepath); });
  files.forEach(function(file) {
    var item = document.importNode(document.querySelector('#file').content, true);
    
    var heading = item.querySelector('h4');
    heading.textContent = file.data.filepath;
    var diff = item.querySelector('.diff code');
    list.appendChild(item);

    $.ajax('/baseline/' + project + '/' + file.data.filepath).done(function(baseline) {
      // Save data for regex updating
      // TODO: Better way to do this?
      $(diff).data('baseline', baseline);
      $(diff).data('text', file.data.text); // TODO: update this data on update
      $(diff).data('filepath', file.data.filepath);

      var extraArgsForFile = Object.assign({'filepath': file.data.filepath}, extraArgs);

      if (cutoff) {
        $.ajax('/historical/' + project + '/' + collabid + '/' + file.data.filepath + '/' + cutoff).done(function(historical) {

          // Used for regex updating
          if (historical.data) {
            $(diff).data('text', historical.data.text); // TODO: update this data on update
          }

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



/////////////////////////////////////////////
///////////// UPDATE FUNCTIONS //////////////
// Displays DOM differently for different visualizations.

function updateFunction(node, baseline, text, extraArgs) {
  if (baseline === undefined || text === undefined) { return; }
  node.innerHTML = '';
  // TODO: This causes page to seem as if it's refreshing every
  //   time you change the regex, and causes you to lose whatever
  //   spot in the files you were at

  var threshold = parameters['threshold'];
  var regexes = parameters['regexes'];
  var hideCommon = parameters['hideCommonPrefixes'];

  if (!threshold) {
    // No treshold means no total diff
    drawNormalDiff(baseline, text, node);

    if (regexes) {
      addRegexHighlighting(node, regexes);
      // TODO: Without regex matching, the entire line is highlighted
      //   in light yellow if the student added that code.
      // However, now only the part of the line with code on it is
      //   highlighted.
    }

  } else {
    // Get the flattened diff to display in total diff style
    var filepath = extraArgs["filepath"];
    var url = getAjaxUrlForTotalDiff(filepath, threshold);

    $.ajax(url).done(function(diff) {
      var divs = addTotalDiffDeletesOnSideDom(diff, node);

      if (hideCommon) {
        divs.forEach(function(div) {
          hideCommonPrefixes(div);
        });
      }

      if (regexes) {
        divs.forEach(function(div) {
          addRegexHighlighting(div, regexes);
        })
      }

      // TODO: Bug, after un-checking a regex, it appends the same text
      //   over and over so there's 6 filetexts in a row

      if (!showDeletedCode) {
        hideDeletedCode();
      }

      // TODO: Add syntax highlighting?   

    }).fail(function(req, status, err) {
      // TODO: 'list is not defined' error if we get here
      list.textContent = 'Error fetching total diff: ' + errorToString(req.responseJSON, status, err);
    });
  }
}


/////////////////////////////////////////////
///////////// HELPER FUNCTIONS //////////////

/**
 * Get the regexes value from the given URL string.
 * Returns the regexes as a list.
 */
function getRegexesFromUrl(url) {
  var regexes = '';
  var beginningOfRegexes = url.indexOf("regexes=");
  if (beginningOfRegexes != -1) {
    regexes = url.substring(beginningOfRegexes + "regexes=".length);
  }

  // The URL can have both threshold= and regexes=, so need to filter that out
  if (regexes.indexOf("threshold=") != -1) {
    regexes = regexes.substring(0, regexes.indexOf("threshold="));
  }

  regexes = regexes.split(';;');
  return regexes;
}

/**
 * Get the threshold value from the given URL string
 */
function getThresholdFromUrl(url) {
  var threshold = null;
  var beginningOfThreshold = url.indexOf("threshold=");
  if (beginningOfThreshold != -1) {
    threshold = url.substring(beginningOfThreshold + "threshold=".length);
  }

  // The URL can have both threshold= and regexes=, so need to filter that out
  if (threshold && threshold.indexOf("regexes=") != -1) {
    threshold = threshold.substring(0, threshold.indexOf("regexes="));
  }

  return (threshold) ? threshold : 10000;
}

/**
 * Given a div with lines of text, hide common prefixes between
 *   every two consecutive lines.
 * If a common prefix is found, that text is removed from the second line.
 */
function hideCommonPrefixes(div) {
  var children = div.childNodes;

  // Split into individual lines
  var lines = [];
  children.forEach(function(child) {
    var childLines = child.innerText.split('\n');
    childLines.pop(); // Last one is always empty
    childLines.forEach(function(childLine) {
      var singleLine = {
        'child': child, // We need the child to know what CSS classes to apply
        'text': childLine
      }
      lines.push(singleLine);
    });
  });

  // Since we need to add children for the common prefixes,
  // Store all the children we should have at the end in a new list
  var newChildNodes = [];
  var firstLine = createSpanElement(lines[0].text + '\n', lines[0].child);
  newChildNodes.push(firstLine);

  for (var i = 1; i < lines.length; i++) {
    // Only consider hiding prefixes if the two lines are both deleted code
    // And are from different snapshots
    if ((!lines[i]  .child.classList.contains('span-removed')) ||
        (!lines[i-1].child.classList.contains('span-removed')) ||
        ($(lines[i].  child).data('part').snapshotNumber ==
         $(lines[i-1].child).data('part').snapshotNumber )) {
      newChildNodes.push(createSpanElement(lines[i].text + '\n', lines[i].child));
      continue;
    }

    var commonPrefixLength = getCommonPrefixLength(lines[i].text, lines[i-1].text);
    if (commonPrefixLength > 10) {
      // Need to change the second child to hide the text in common
      //   by putting spaces there instead (monospace font => correct behavior)

      var commonElt = createSpanElement(Array(commonPrefixLength+1).join(" "), lines[i].child);
      var afterElt = createSpanElement(lines[i].text.substring(commonPrefixLength) + '\n', lines[i].child);

      $(commonElt).addClass('span-removed-common-prefix');

      newChildNodes.push(commonElt);
      newChildNodes.push(afterElt);

      // TODO: Won't work with regexes

    } else {
      // There is no common prefix, so add this child like normal
      newChildNodes.push(createSpanElement(lines[i].text + '\n', lines[i].child));
    }
  }

  replaceChildren(div, newChildNodes);
}

/**
 * Creates a span element with {text} as its text and with
 * the same classes as {child}.
 */
function createSpanElement(text, child) {
  var elt = document.createElement('span');
  elt.appendChild(document.createTextNode(text));
  $(elt).addClass($(child).attr('class'));
  return elt;
}

/**
 * Gets the length of the common prefix between textLine1 and textLine2.
 * For example, getCommonPrefixLength("hello", "here") = 2.
 */
function getCommonPrefixLength(textLine1, textLine2) {
  var j = 0;
  while (j < textLine1.length && j < textLine2.length) {
    if (textLine1.charAt(j) == textLine2.charAt(j)) {
      j += 1;
    } else {
      break;
    }
  }
  return j;
}

/**
 * Given a node containing lines of code and regexes
 *  to find withing that code, update the DOM so that
 *  the regexes are highlighted in yellow.
 */
function addRegexHighlighting(node, regexes) {
  if (regexes.length == 1 && regexes[0] == '') {
    // No regexes given
    return;
  }

  regexes.forEach(function(regex) {
    // Since we need to add children for the common prefixes,
    // Store all the children we should have at the end in a new list
    var newChildNodes = [];

    node.childNodes.forEach(function(child) {
      var foundRegexes = [];
      var stringToCheck = child.innerText;

      // 'g' flag means it finds all matches, not just the first one
      var regexFinder = RegExp(regex, 'g');
      var myArray; // Used to store the results from the regexFinder

      // Find all the regex matches
      while ((myArray = regexFinder.exec(stringToCheck)) !== null) {
        var regexLocation = {
          'indexInLine': myArray['index'],
          'length': myArray[0].length,
        };
        foundRegexes.push(regexLocation);
      }

      // Create the new children based on the found regexes and store them
      var newChildren = addRegexHighlightingWithinElement(child, foundRegexes);
      newChildNodes = newChildNodes.concat(newChildren);
    });

    replaceChildren(node, newChildNodes);

  });
}

/**
 * Given an element and the locations of matching regexes within that
 *   element, returns a list of elements that highlight those regexes
 *   at the given locations.
 */
function addRegexHighlightingWithinElement(elt, regexesLocations) {
  // Don't highlight regexes on original code
  if ($(elt).hasClass('span-original') || $(elt).hasClass('diff-original')) {
    return [elt];
  }

  if (regexesLocations.length == 0) {
    return [elt];
  }

  var classesToAdd = $(elt).attr('class');
  var newElts = [];
  var endOfLastRegex = 0;
  var text = elt.innerText;

  regexesLocations.forEach(function(match) {
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

/**
 * Replace {node}'s current children with the children
 *   in {newChildNodes}.
 */
function replaceChildren(node, newChildNodes) {
  // Remove the old children
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
  // Add the new children
  newChildNodes.forEach(function(child) {
    node.appendChild(child);
  });
}

/**
 * Get the Ajax URL that returns the total diff for {filepath}
 *   using {threshold}.
 */
function getAjaxUrlForTotalDiff(filepath, threshold) {
  var url = '/ops/' + project + '/' + collabid + '/' + filepath
    + (cutoff ? '?cutoff=' + cutoff : '')
    + (threshold ? (cutoff ? '&threshold=' + threshold
                           : '?threshold=' + threshold)
                 : '');
  return url;
}

/**
 * Creates and returns the DOM for a total diff visualization
 *   where the deleted code is shown on the right.
 *   (for visual1_deletesOnSide).
 * Adds that DOM inside {node}.
 */
function addTotalDiffDeletesOnSideDom(diff, node) {
  var divNormal = document.createElement('div');
  divNormal.classList.add('div-normal');
  divNormal.classList.add('col-xs-6');
  var divDeleted = document.createElement('div');
  divDeleted.classList.add('div-deleted');
  divDeleted.classList.add('col-xs-6');

  diff.forEach(function(part) {
    if (part.value.length > 0) {
    
      var elt = document.createElement('span');
      // Save part data for hide common prefix
      $(elt).data('part', part);

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
      $(elt2).data('part', part);
      divDeleted.appendChild(elt2);
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


/**
 * Convert an error to a string.
 */
function errorToString(json, status, err) {
  return (json && json.code || status) + ' ' + (json && json.message || err);
}

/**
 * Hide all DOM with deleted code.
 */
function hideDeletedCode() {
  $('.span-removed').hide();
  $('.div-deleted').hide();
  $('.div-normal').removeClass('col-xs-6');
  $('.div-normal').addClass('col-xs-12');
}

/**
 * Add the given regex to the controls box DOM.
 */
function addRegexToControls(regex) {
  if (regex == '') { return; }

  var row = document.createElement('div');
  row.classList.add('row');
  row.classList.add('regex-row');

  var label = $("<p>").text(regex);
  label.addClass('col-xs-10');
  var checkboxCol = document.createElement('div');
  checkboxCol.classList.add('col-xs-2');
  var checkbox = $("<input id='" + regex + "' type='checkbox' checked>");
  checkbox.addClass('cb-regex');
  $(checkboxCol).append(checkbox);
  
  $(row).append(checkboxCol);
  $(row).append(label);

  // Text box to add new regexes should always be the bottom
  $(row).insertBefore($('#add-regex-row'));
}

/**
 * Update the file display based on what regexes are currently selected.
 */
function updateFileDisplayWithCurrentRegexes() {
  // Get currently active regexes
  var regexes = []
  $('.cb-regex:checkbox:checked').each(function(index) {
    var regex = $(this)[0].id;
    regexes.push(regex);
  });

  parameters['regexes'] = regexes;

  // Re-render each file with new regexes
  $(".file").each(function(index) {
    var baseline = $(this).data('baseline');
    var text = $(this).data('text');
    var filepath = $(this).data('filepath');
    updateFunction(this, baseline, text, {'filepath': filepath});
  });
}



///////////////////////////////////////////
///////////// EVENT HANDLERS //////////////

/* Toggle whether deleted code is displayed or not */
$("#cb-deleted-code").click(function() {
  showDeletedCode = !showDeletedCode;
  $('.span-removed').toggle();
  $('.div-deleted').toggle();

  if (showDeletedCode) {
    $('.div-normal').removeClass('col-xs-12');
    $('.div-normal').addClass('col-xs-6');
  } else {
    $('.div-normal').removeClass('col-xs-6');
    $('.div-normal').addClass('col-xs-12');
  }
});

/* Add the user-typed regex to the list and update the display */
$("#add-regex").click(function() {
  var newRegex = $('#new-regex-text').val();
  $('#new-regex-text').val('');
  addRegexToControls(newRegex);
  updateFileDisplayWithCurrentRegexes();
});

/* When a regex is checked or un-checked, update the display */
$('#visual-controls').on("click", ".cb-regex", function() {
  updateFileDisplayWithCurrentRegexes();
});
