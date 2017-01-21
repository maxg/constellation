const bunyan = require('bunyan');
const path = require('path');

const config = require('./config');

const main = require.main ? require.main.filename : '_console';

const filename = `log/constellation-${path.basename(main, '.js')}.log`;

var streams = [ { path: filename } ];
if (config.env === 'development') {
  streams.push({ stream: process.stdout });
}
if (config.env === 'test') {
  streams.forEach(string => stream.level = 'debug');
}

exports.log = bunyan.createLogger({
  name: 'constellation',
  streams,
  serializers: bunyan.stdSerializers,
});

exports.express = log => (req, res, next) => {
  const done = () => {
    res.removeListener('finish', done);
    res.removeListener('close', done);
    log[res.statusCode < 500 ? 'info' : 'error']({ req, res });
  };
  res.once('finish', done);
  res.once('close', done);
  next();
};
