// 1. Extract query parameters into a dictionary

var queryMap = {};

// '?k1=v1&k2=v2' => [ 'k1=v1', 'k2=v2' ]
location.search.substring(1).split('&').forEach(function(queryPair) {
    // 'key=value' => [ 'key', 'value' ]
    var keyValue = queryPair.split('=');

    queryMap[keyValue[0]] = keyValue[1];
});


// 2. Compute styles to add based on query parameters

var newStyles = []

if (queryMap['prototype'] == 'shrinkText') {
    // darken background and border
    newStyles.push('body { background: #444; }');
    newStyles.push('.panel-body { background: #444; }');
    newStyles.push('.panel-default { border-color: #666; }');
    // shrink text sizes and increase contrast
    newStyles.push('.diff { font-size: 12px; }');
    // newStyles.push('.diff .diff-part:not(.diff-added) { font-size: 0.5px; background: #222; }');
    newStyles.push('.diff .diff-added { background: #fffbeb; }');
    newStyles.push('.diff .diff-error { background: #f88 }');
    newStyles.push('.diff .diff-newest { background: #bfb; }');
    newStyles.push('h4 { font-size: 10px; color: white; }');
    // hide header and badge
    newStyles.push('.row:not(#files) { display: none; }');
    newStyles.push('#user { display: none; }');
    // shrink import diffs
    newStyles.push('.diff .diff-added.diff-import { font-size: 4px; }');
}


// 3. Attach new styles to the document

if (newStyles.length > 0) {
    var newStyleSheet = document.createElement('style');

    newStyles.forEach(function(newStyle) {
        newStyleSheet.innerHTML += newStyle + '\n';
    });

    document.body.append(newStyleSheet);
}


// 4. Update diff behavior

var lastCursorKerberos = undefined;
var lastCursorTimestamp = undefined;
var markers = {}; // file : line : message

function updateMarkerDisplay() {
  var errorElts = document.getElementsByClassName('diff-error');
  for (var i = 0; i < errorElts.length; i++) {
    errorElts[i].title = "";
    errorElts[i].classList.remove('diff-error');
  }
  for (var fileName in markers) {
    for (var lineNumber in markers[fileName]) {
      var line = document.getElementById(fileName + '-' + lineNumber);
      line.classList.add('diff-error');
      line.title = markers[fileName][lineNumber][0];
    }
  }
}

if (queryMap['prototype'] == 'shrinkText') {
    var oldUpdateDiff = updateDiff_basic;
    updateDiff_basic = function(node, baseline, text, extraArgs) {
        if (baseline === undefined || text === undefined) { return; }

        var fileNode = node.parentNode.parentNode; // use to determine which file
        var fileName = fileNode.children[0].innerHTML;

        // track node of latest op
        var op = extraArgs.op;
        var count = 0;
        var diffEltIndex = undefined;
        var diffEltOffset = 0;
        var opIndex = op === undefined ? -1 : (op[0].p[0] === 'text' ? -1 : op[0].oi[0]);

        if (op !== undefined) {
          if (op[0].p[0] === 'markers') {
            var kerberos = op[0].p[1];
            var errors = op[0].oi;
            markers[fileName] = {};
            for (var i = 0; i < errors.length; i++) {
              var lineNumber = errors[i].lineNumber;
              var message = errors[i].message;
              if (markers[fileName][lineNumber] === undefined) {
                markers[fileName][lineNumber] = [message];
              } else {
                markers[fileName][lineNumber].push(message);
              }
            }
            updateMarkerDisplay();
            return;
          }
          if (lastCursorKerberos === undefined) {
            lastCursorKerberos = op[0].p[1];
            lastCursorTimestamp = Date.now();
          } else if (lastCursorKerberos === op[0].p[1]) {
            lastCursorTimestamp = Date.now();
          } else if (Date.now() - lastCursorTimestamp > 1000) {
            lastCursorKerberos = op[0].p[1];
            lastCursorTimestamp = Date.now();
          } else {
            opIndex = -1;
          }
        }

        node.innerHTML = '';

        var lineNumber = 0;
        window.diff.diffLines(baseline.trim(), text.trim()).forEach(function(multipart) {

          var parts = multipart.value.split('\n');
          if (multipart.value[multipart.value.length-1] === '\n') {
            parts = parts.slice(0, parts.length - 1);
          }
          parts.forEach(function(p) {
            var part = { added: multipart.added, removed: multipart.removed, value: p };

            var elt = document.createElement('div');
            elt.classList.add('diff-part');
            if (part.added) {
              lineNumber++;
              elt.id = fileName + '-' + lineNumber;
              elt.classList.add('diff-added');

              // shrink imports
              if (part.value.indexOf('import ') == 0
  	        || part.value.indexOf('package ') == 0) {
                elt.classList.add('diff-import');
              }

              elt.appendChild(document.createTextNode(part.value));

              // check if node of latest op
              count += part.value.length;
              if (opIndex != -1 && diffEltIndex === undefined && count >= opIndex) {
                diffEltIndex = node.children.length;
                diffEltOffset = opIndex - (count - part.value.length);
                elt.classList.add('diff-newest');
              }
            } else if (part.removed) {
              elt.classList.add('diff-removed');
            } else {
              lineNumber++;
              elt.id = fileName + '-' + lineNumber;
              elt.appendChild(document.createTextNode(part.value));

              // check if node of latest op
              count += part.value.length;
              if (opIndex != -1 && diffEltIndex === undefined && count >= opIndex) {
                diffEltIndex = node.children.length;
                diffEltOffset = opIndex - (count - part.value.length);
                elt.classList.add('diff-newest');
              }
            }
            node.appendChild(elt);
          })
        });
        hljs.highlightBlock(node);
        updateMarkerDisplay();

        // determine scroll offset of latest op
        if (opIndex == -1) { return; }
        var newestChild = node.children[diffEltIndex];

        var leastScrollOffset = newestChild.offsetTop;
        var highestScrollOffset = newestChild.offsetTop + newestChild.offsetHeight;

        var offsetCount = 0;
        var diffFound = false;
        for (var i = 0; i < newestChild.childNodes.length; i++) {
          var child = newestChild.childNodes[i];
          if (child.wholeText) {
            offsetCount += child.wholeText.length;
          } else {
            offsetCount += child.innerText.length;
            if (!diffFound) {
              leastScrollOffset = Math.max(leastScrollOffset, child.offsetTop);
            } else {
              highestScrollOffset = Math.min(highestScrollOffset, child.offsetTop + child.offsetHeight);
            }
          }
          if (offsetCount >= diffEltOffset) {
            diffFound = true;
          }
        }

        parent.postMessage([collabid, leastScrollOffset, highestScrollOffset], "*");
    };
}
