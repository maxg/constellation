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
    // shrink text size
    newStyles.push('.diff { font-size: 10px; }');
    // shrink non-diff text size by a lot and increase contrast
    newStyles.push('.diff .diff-part:not(.diff-added) { font-size: 5%; background: rgba(0,0,0,0.7); }');
    // shrink filenames
    newStyles.push('h4 { font-size: 10px; }');
    // hide the header
    newStyles.push('.row:not(#files) { display: none; }');
    // hide the user badge
    newStyles.push('#user { display: none; }');
}


// 3. Attach new styles to the document

var newStyleSheet = document.createElement('style');

newStyles.forEach(function(newStyle) {
    newStyleSheet.innerHTML += newStyle + '\n';
});

document.body.append(newStyleSheet);

