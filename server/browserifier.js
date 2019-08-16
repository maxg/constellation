const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const browserify = require('browserify');

module.exports = function browserifier(pubdir) {
  
  let cache = {};
  
  return function(req, res, next) {
    if (path.extname(req.path) !== '.js') {
      return next();
    }
    if (cache[req.path]) {
      return send(cache[req.path]);
    }
    let file = path.normalize(path.join(pubdir, req.path));
    if (file.indexOf(`${pubdir}${path.sep}`) !== 0) {
      return next();
    }
    fs.exists(file, exists => {
      if ( ! exists) {
        return next();
      }
      browserify(file).bundle((err, src) => {
        if (err) { return next(err); }
        return send(cache[req.path] = src);
      });
    });
    
    function send(src) {
      res.setHeader('Content-Type', 'application/javascript');
      let etag = crypto.createHash('md5').update(src).digest('hex').slice(0, 8);
      if (req.get('If-None-Match') === etag) {
        return res.status(304).end('');
      }
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', `max-age=${60 * 5}`);
      res.setHeader('Vary', 'Accept-Encoding');
      res.end(src);
    }
  };
};
