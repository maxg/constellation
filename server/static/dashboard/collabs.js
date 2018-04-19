var connection = new window.sharedb.Connection(new WebSocket(shareURL));

var collabs = connection.createSubscribeQuery('collabs', {
  project: project,
  '_m.ctime': cutoff ? { $lte: +moment(cutoff) } : { $exists: true },
  $sort: { '_m.ctime': -1 }
}, {});

collabs.on('ready', function() { insertCollabs(collabs.results, 0); });
collabs.on('insert', insertCollabs);

function insertCollabs(collabs, atIndex) {
  var list = document.querySelector('#collabs');

  //var hasPrefixesCount = 0;
  //var totalPairsCount = 0;

  collabs.forEach(function(collab, idx) {
    var item = document.importNode(document.querySelector('#collab').content, true);
    var root = item.querySelector('.collab');
    root.setAttribute('id', 'collab-' + collab.id);
    let users = collab.data.users.slice().sort();
    root.dataset.users = users.join(',');
    var link = item.querySelector('a');
    var href = '/dashboard/' + project + '/' + collab.id
      + (milestone ? '/m/' + milestone : '')
      + (cutoff ? '/' + cutoff : '')
      + (visual ? '?visual=' + visual : '');
    // TODO: Persist '?visual=' when going from specific
    //   checkoff back to dashboard
    link.setAttribute('href', href);
    link.textContent = users.join('\n');
    list.insertBefore(item, list.children[atIndex + idx]);


    // Figure out if hide common prefix is triggered on this collab
    var threshold = 10000; // Default threshold
    var collabid = collab.id;

    connection.createFetchQuery('files', { collabid: collab.id }, {}, function(err, files) {
      files.forEach(function(file) {
        var filepath = file.data.filepath;        
        var url = getAjaxUrlForTotalDiff(filepath, threshold, project, collabid, cutoff);
        $.ajax(url).done(function(diff) {
          var hasPrefixes = hasCommonPrefixes(diff);
          if (hasPrefixes) {
            $(link).css('background-color', 'yellow');
          }
        }).fail(function(req, status, err) {
          list.textContent = 'Error fetching total diff: ' + errorToString(req.responseJSON, status, err);
        });
      });
    });

    // Because of async, can't get total pairs who have prefixes vs. don't
    /* 
    if (hasPrefixesAnyFile) {
      $(link).css('background-color', 'yellow');
      hasPrefixesCount++;
    }
    totalPairsCount++;

    // TODO: This prints after every pair but should only print at the end
    console.log("hasPrefixes:" + hasPrefixesCount);
    console.log("totalPairsCount:" + totalPairsCount);
    */

  });

  deduplicate();
}

function deduplicate() {
  var seen = {};
  Array.prototype.slice.call(document.querySelector('#collabs').children).forEach(function(item) {
    var users = item.dataset.users.split(',');
    var unseen = users.filter(function(user) { return ! seen[user]; });
    if ( ! unseen.length) {
      document.querySelector('#dupes-header').classList.remove('hidden');
      document.querySelector('#dupes').appendChild(item);
      return;
    }
    users.forEach(function(user) { seen[user] = true; });
  });
}

// TODO: Duplicate code
/** Gets the ajax URL needed if you want to get the total diff
      for the given filepath */
function getAjaxUrlForTotalDiff(filepath, threshold, project, collabid, cutoff) {
  var url = '/ops/' + project + '/' + collabid + '/' + filepath
    + (cutoff ? '?cutoff=' + cutoff : '')
    + (threshold ? (cutoff ? '&threshold=' + threshold
                           : '?threshold=' + threshold)
                 : '');
  return url;
}

// TODO: Duplicate code
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

function hasCommonPrefixes(diff) {
  // Split into lines
  var lines = [];
  diff.forEach(function(part) {
    var partLines = part.value.split('\n');
    partLines.pop(); // Last one is always empty
    partLines.forEach(function(partLine) {
      var singleLine = {
        'text': partLine,
        'removed': part.removed
      }
      lines.push(singleLine);
    });
  });

  // Find common prefixes
  for (var i = 1; i < lines.length; i++) {
    // Only consider hiding prefixes if the two lines are both deleted code
    if (!lines[i]  .removed ||
        !lines[i-1].removed) {
      continue;
    }

    var commonPrefixLength = getCommonPrefixLength(lines[i].text, lines[i-1].text);
    if (commonPrefixLength > 10) {
      return true;
    }
  }
  return false;
};