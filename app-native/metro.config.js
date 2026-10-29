// Metro (the bundler) settings. pdf-lib ships an old tslib whose "import"
// entry (modules/index.js) breaks on the web build ("Cannot destructure
// property '__extends' of 'tslib.default'"), leaving a blank page. Every
// tslib import is pointed at the plain ES module file next to it instead.
const { getDefaultConfig } = require('expo/metro-config');
const fs = require('fs');
const path = require('path');

const config = getDefaultConfig(__dirname);
const resolveDefault = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const res = (resolveDefault || context.resolveRequest)(context, moduleName, platform);
  if (moduleName === 'tslib' && res && res.type === 'sourceFile') {
    const es6 = path.join(path.dirname(res.filePath).replace(/[\\/]modules$/, ''), 'tslib.es6.js');
    if (fs.existsSync(es6)) return { type: 'sourceFile', filePath: es6 };
  }
  return res;
};

module.exports = config;
