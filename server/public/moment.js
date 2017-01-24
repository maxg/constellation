window.moment = require('moment');

moment.fn.toLocal = function() {
  return this.format('YYYY-MM-DDTHH:mm:ss');
};
