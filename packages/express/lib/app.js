'use strict';

var fs = require('fs');
var path = require('path');

var express = require('express');
var mime = require('mime');
var helmet = require('helmet');
var compression = require('compression');

var hopsConfig = require('hops-config');
var utils = require('./utils');

var swRe = new RegExp(hopsConfig.workerPath + '$');

function createApp(options) {
  var app = express();
  app.use(utils.timings);
  app.use(helmet());
  app.use(compression());
  app.use(utils.rewritePath);
  app.use(
    express.static(hopsConfig.buildDir, {
      maxAge: '1y',
      setHeaders: function(res, filepath) {
        if (mime.getType(filepath) === 'text/html' || filepath.match(swRe)) {
          helmet.noCache()(null, res, function() {});
        }
      },
      redirect: false,
    })
  );
  utils.bootstrap(app, hopsConfig);
  if (options && !options.static) {
    var filePath = path.join(hopsConfig.cacheDir, 'server.js');
    if (fs.existsSync(filePath)) {
      utils.registerMiddleware(app.use(helmet.noCache()), require(filePath));
    } else {
      console.log(
        'No middleware found. Delivering only statically built routes.'
      );
    }
  }
  utils.teardown(app, hopsConfig);
  return app;
}

module.exports = createApp;
