var queryparams = {};
// '?k1=v1&k2=v2' => [ 'k1=v1', 'k2=v2' ]
location.search.substring(1).split('&').forEach(function(param) {
  // 'key=value' => [ 'key', 'value' ]
  var keyvalue = param.split('=');
  queryparams[keyvalue[0]] = keyvalue[1];
});
