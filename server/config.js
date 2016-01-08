var fs = require('fs');

module.exports = require('./config/env-' + (process.env.NODE_ENV || 'development'));

module.exports.listConfFilesSync = function(regex) {
  return fs.readdirSync(__dirname + '/config').filter(function(name) {
    return regex.test(name);
  });
}

module.exports.readConfFileSync = function(filename) {
  return fs.readFileSync(__dirname + '/config/' + filename, { encoding: 'utf8' });
};
