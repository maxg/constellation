window.diff = require('diff');

window.filepathQuery = function filepathQuery() {
  if (filepath) {
    if (filepath.includes('*')) {
      return { $regex: filepath.replace(/\*/g, '[^/]*') };
    }
    return filepath;
  }
  return undefined;
};
