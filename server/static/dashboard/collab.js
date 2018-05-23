/////////////////////////////////////////////
///////////// GLOBAL VARIABLES //////////////

var connection = new window.sharedb.Connection(new WebSocket(shareURL));

var collab = connection.get('collabs', collabid);
collab.fetch(function(err) {
  if (err) { throw err; }
  
  document.querySelector('#partners').textContent = collab.data.users.slice().sort().join(' & ')
});


/**
 * Parameters for visuals:
 *
 * ?deletedCode=true
 *   Note: ignores threshold, so threshold=10000 always
 *   and is set within diffing.js
 * ?regexes=xyz;;abc
 * ?hideCommonPrefix=true
 */

// Whether deleted code is currently shown or not
var showDeletedCode = false;

if (regexes) {
  // Change global variable so it's a list
  regexes = regexes.split(';;');
  regexes.forEach(function(regex) {
    addRegexToControls(regex);
  });
}


//////////////////////////////////////
///////////// MAIN CODE //////////////

/**
 * Fetch the files for this collab, determine which visual to use,
 *   and display the files accordingly.
 */
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
      // Save data for regex updating
      // TODO: Better way to do this?
      $(diff).data('baseline', baseline);
      $(diff).data('text', file.data.text); // TODO: update this data on update
      $(diff).data('filepath', file.data.filepath);

      var extraArgs = {'filepath': file.data.filepath};

      if (cutoff) {
        $.ajax('/historical/' + project + '/' + collabid + '/' + file.data.filepath + '/' + cutoff).done(function(historical) {

          // Save text data for regex matching
          $(diff).data('text', historical.data.text);

          displayFileVisual(diff, baseline, historical.data ? historical.data.text : undefined, extraArgs);

        }).fail(function(req, status, err) {
          diff.textContent = 'Error fetching code: ' + errorToString(req.responseJSON, status, err);
        });
      } else {
        file.subscribe(function() {
          displayFileVisual(diff, baseline, file.data.text, extraArgs);
          file.on('op', function(op) {
            extraArgs["op"] = op;
            displayFileVisual(diff, baseline, file.data.text, extraArgs);
          });
        });
      }
    }).fail(function(req, status, err) {
      diff.textContent = 'Error fetching baseline: ' + errorToString(req.responseJSON, status, err);
    });
  });
});


function displayFileVisual(node, baseline, text, extraArgs) {
  if (baseline === undefined || text === undefined) { return; }

  if (!deletedCode) {
    drawStandardDiff(baseline, text, node);

    if (regexes) {
      addRegexHighlighting(node, regexes);
      // TODO: Without regex matching, the entire line is highlighted
      //   in light yellow if the student added that code.
      // However, now only the part of the line with code on it is
      //   highlighted.
    }

  } else {
    // Get the chunked diff to display some deleted code
    var filepath = extraArgs["filepath"];
    var url = '/ops/' + project + '/' + collabid + '/' + filepath
    + (cutoff ? '?cutoff=' + cutoff : '');

    $.ajax(url).done(function(diff) {
      var divs = drawChunkedDiff(diff, node);

      if (hideCommonPrefix) {
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
      node.textContent = 'Error fetching chunked diff: ' + errorToString(req.responseJSON, status, err);
    });
  }
}


/////////////////////////////////////////////
///////////// HELPER FUNCTIONS //////////////


/**
 * Given a div with lines of text, hide common prefixes between
 *   every two consecutive lines.
 * If a common prefix is found, that text is removed from the second line.
 */
 function hideCommonPrefixes(div) {
   var children = div.childNodes;

   // Convert DOM to have individual lines of code
   var singleLineChildren = [];
   children.forEach(function(child) {
     var childLinesText = child.innerText.split('\n');
     childLinesText.pop(); // Last one is always empty
     childLinesText.forEach(function(singleLineText) {
       var childDom = createSpanElement(singleLineText + '\n', child);
       childDom.dataset.snapshotNumber = child.dataset.snapshotNumber;
       singleLineChildren.push(childDom);
     });
   });
   replaceChildren(div, singleLineChildren);

   // Hide common prefixes between lines
   var newChildren = [];
   Array.from(div.childNodes).slice(1).forEach(function(child) {
     var prevChild = child.previousSibling;

     // Only consider hiding prefixes if the two lines are both deleted cod
     // And are from different snapshots
     if (     child.classList.contains('span-removed') &&
          prevChild.classList.contains('span-removed') &&
          child.dataset.snapshotNumber != prevChild.dataset.snapshotNumber ) {

       var commonPrefixLength = getCommonPrefixLength(prevChild.innerText, child.innerText);
       if (commonPrefixLength > 10) {
         var commonElt = createSpanElement(child.innerText.substring(0, commonPrefixLength), child);
         var afterElt = createSpanElement(child.innerText.substring(commonPrefixLength), child);

         $(commonElt).addClass('span-removed-common-prefix');

         newChildren.push(commonElt);
         newChildren.push(afterElt);
       }

     } else {
       newChildren.push(child);
     }
   });
   replaceChildren(div, newChildren);
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
 * Creates and returns the DOM for a chunked diff visualization
 *   where the deleted code is shown on the right.
 *   (for visual1_deletesOnSide).
 * Adds that DOM inside {node}.
 */
function drawChunkedDiff(diff, node) {
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
      elt.dataset.snapshotNumber = part.snapshotNumber;

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
    }
  });

  node.innerHTML = '';
  node.appendChild(divNormal);
  node.appendChild(divDeleted);

  return [divNormal, divDeleted];
}

/**
 * Draws a normal diff inside the node element.
 */ 
function drawStandardDiff(baseline, text, node) {
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
  var newRegexes = [];
  $('.cb-regex:checkbox:checked').each(function(index) {
    var regex = $(this)[0].id;
    newRegexes.push(regex);
  });

  regexes = newRegexes;

  // Re-render each file with new regexes
  $(".file").each(function(index) {
    var baseline = $(this).data('baseline');
    var text = $(this).data('text');
    var filepath = $(this).data('filepath');
    displayFileVisual(this, baseline, text, {'filepath': filepath});
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
