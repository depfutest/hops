/* eslint-env node, jest */

var fs = require('fs');
var path = require('path');

var rimraf = require('rimraf');
var mkdirp = require('mkdirp');
var fetch = require('isomorphic-fetch');

var originalDir = process.cwd();
var appDir = path.resolve(__dirname, 'fixtures', 'integration');
var buildDir = path.resolve(appDir, 'build');
var cacheDir = path.resolve(appDir, 'node_modules', '.cache', 'hops');

describe('production server', function() {
  jest.setTimeout(100000);

  var app;
  var port;
  beforeAll(function(done) {
    rimraf.sync(buildDir);
    rimraf.sync(cacheDir);
    mkdirp.sync(cacheDir);
    process.chdir(appDir);
    jest.resetModules();
    require('hops-build').runBuild({ clean: true }, function() {
      require('hops-express').runServer({}, function(error, _app) {
        app = _app;
        port = app.address().port;
        done(error);
      });
    });
  });
  afterAll(function() {
    app.close();
    process.chdir(originalDir);
  });

  it('should create server.js', function() {
    var filePath = path.resolve(cacheDir, 'server.js');

    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('should create manifest file', function() {
    var filePath = path.join(buildDir, 'stats.json');

    expect(fs.existsSync(filePath)).toBe(true);
    var manifest = require(filePath);

    expect(manifest).toMatchObject({
      entrypoints: {
        main: {
          chunks: ['vendors~main', 'main'],
          assets: expect.any(Array),
        },
      },
    });
  });

  it('should create build files', function() {
    var fileNames = fs.readdirSync(buildDir);

    expect(fileNames).toContainEqual(
      expect.stringMatching(/^main-[0-9a-f]+\.js$/)
    );
    expect(fileNames).toContainEqual(
      expect.stringMatching(/^vendors~main-[0-9a-f]+\.js$/)
    );
    expect(fileNames).toContainEqual(
      expect.stringMatching(/^main-[0-9a-f]+\.css$/)
    );
  });

  it('should deliver expected html page', function() {
    return fetch('http://localhost:' + port + '/')
      .then(function(response) {
        expect(response.ok).toBe(true);
        return response.text();
      })
      .then(function(body) {
        expect(body.length).toBeGreaterThan(0);
        expect(body).toMatch('<!doctype html>');
        expect(body).toMatch('Hello World!');
      });
  });

  it('should deliver all asset files', function() {
    var manifest = require(path.resolve(buildDir, 'stats.json'));

    return Promise.all(
      manifest.assets.map(function(asset) {
        return fetch('http://localhost:' + port + '/' + asset.name)
          .then(function(response) {
            expect(response.ok).toBe(true);
            return response.text();
          })
          .then(function(body) {
            expect(body.length).toBeGreaterThan(0);
            expect(body).not.toMatch('<!doctype html>');
            expect(body).toBe(
              fs.readFileSync(
                path.resolve(buildDir, asset.name.replace(/^\/?/, '')),
                'utf8'
              )
            );
          });
      })
    );
  });

  it('should deliver 404 when route does not match', function() {
    return expect(
      fetch('http://localhost:' + port + '/thisdoesnotexist')
    ).resolves.toMatchObject({
      status: 404,
    });
  });

  it('adds server-timing header', function() {
    return fetch('http://localhost:' + port + '/').then(function(response) {
      expect(response.headers.get('server-timing')).toMatch('desc="Request"');
    });
  });
});
