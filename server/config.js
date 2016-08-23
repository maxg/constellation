const fs = require('fs');

const dir = `${__dirname}/config`;
const env = process.env.NODE_ENV || 'development';

module.exports = Object.assign(require(`${dir}/env-${env}`), {
  dir,
  env,
});
