var camp = require('../lib/camp');
var fleau = require('fleau');
var http = require('http');
var mime = require('../lib/mime.json');
var Test = require('./test');
var t = new Test();

var get = function (path, callback) {
  http.get('http://localhost:' + portNumber + path, callback);
};
var post = function (path, postData, contentType, callback) {
  var options = {
    hostname: 'localhost',
    port: portNumber,
    path: path,
    method: 'POST'
  };
  var req = http.request(options, callback);
  if (contentType) req.setHeader('Content-Type', contentType);
  if (postData) req.write(postData);
  req.end();
};

var launchTests = function () {
  t.seq([
    function t0 (next) {
      get('', function (res) {
        t.eq(res.httpVersion, '1.1', "Server must be HTTP 1.1.");
        t.eq(res.headers['transfer-encoding'], 'chunked',
          "Connection should be chunked by default.");
        res.on('data', function (content) {
          t.eq('' + content, '404',
               "Did not receive content of index.html.");
          next();
        });
      });
    },

    function t1 (next) {
      // Using a streamed route.
      // Create a stream out of the following string.
      var template = '{{= text in plain}}\n{{for comment in comments{{\n- {{= comment in plain}}}} }}';

      server.route( /^\/blog$/, function (query, match, end) {
        end ({
          text: 'My, what a silly blog.',
          comments: ['first comment!', 'second comment…']
        }, {
          string: template,   // A stream.
          reader: fleau
        });
      });

      // Test that now.
      get('/blog', function (res) {
        var content = '';
        res.on('data', function (chunk) {
          content += '' + chunk;
        });
        res.on('end', function () {
          t.eq(content, 'My, what a silly blog.\n\n- first comment!\n- second comment…',
            "Routing a streamed template should work.");
          next();
        });
      });
    },

    function t2 (next) {
      // Using `sc.path` with/out named non-slash placeholders (i.e. ':foo').
      server.path('foo', function (req, res) {
        res.end('foo');
      });

      server.path('foo/:bar', function (req, res) {
        res.end('bar=' + req.data.bar);
      });

      server.path('foo/:bar/baz', function (req, res) {
        res.end('baz');
      });

      get('/foo', function (res) {
        res.on('data', function (body) {
          t.eq(String(body), 'foo',
            'Basic sc.path should work.');

          get('/foo/quux', function (res) {
            res.on('data', function (body) {
              t.eq(String(body), 'bar=quux',
                'Named sc.path placeholder should work.');

              get('/foo/quux/baz', function (res) {
                res.on('data', function (body) {
                  t.eq(String(body), 'baz',
                    'Named sc.path placeholder should not pre-empt sub-paths.');
                  next();
                });
              });
            });
          });
        });
      }); // Mmmh… I love spaghetti!
    },

    function t3 (next) {
      var data = { message: '☃' };

      server.path('json', function (req, res) {
        res.statusCode = 418; // I'm a teapot (see RFC 2324).
        res.json(data, null, 2);
      });

      get('/json', function (res) {
        t.eq(res.statusCode, 418,
          'Setting `res.statusCode` before `res.json(data)` should work.');
        t.eq(res.headers['content-type'], mime.json,
          'Served content type should always be "' + mime.json + '".');
        var body = '';
        res.on('data', function (chunk) {
          body += String(chunk);
        });
        res.on('end', function () {
          t.eq(String(body).trim(), JSON.stringify(data, null, 2),
            '`res.json(data, null, 2)` should return human-readable JSON.');
          next();
        });
      });
    },

    function t4 (next) {
      var data = { id: '☃' };
      var things = {};

      server.get('things/:thing', function (req, res) {
        var thing = things[req.query.thing];
        if (!thing) {
          res.statusCode = 404;
          res.end('Could not find the thing :(');
          return;
        }
        res.json(thing);
      });

      server.post('things/:thing', function (req, res) {
        t.eq(req.headers['content-type'], mime.json,
          'Request content type should be "' + mime.json + '".');
        var json = '';
        req.on('data', function (chunk) {
          json += String(chunk);
        });
        req.on('end', function () {
          var thing = JSON.parse(json);
          t.eq(data.id, thing.id,
            'Handling JSON post data should work.');
          things[req.query.thing] = thing;
          res.statusCode = 201; // Created.
          res.end('Created the thing! :)');
        });
      });

      post('/things/snowman', JSON.stringify(data), mime.json, function (res) {
        t.eq(res.statusCode, 201,
          'Response status should be 201, not ' + res.statusCode + '.');
        get('/things/snowman', function (res) {
          var json = '';
          res.on('data', function (chunk) {
            json += String(chunk);
          });
          res.on('end', function () {
            t.eq(data.id, JSON.parse(json).id,
              'Should receive the original data back.');
            next();
          });
        });
      });
    }
  ], function end () {
    t.tldr();
    process.exit(0);
  });
};

// FIXME: is there a good way to make a server get a port for testing?
var server;
var portNumber = 8000;
var startServer = function () {
  server = camp.start({port:portNumber, documentRoot:'./test/web'});
  server.on('listening', launchTests);
};
var serverStartDomain = require('domain').create();
serverStartDomain.on('error', function (err) {
  if (err.code === 'EADDRINUSE') {
    portNumber++;
    serverStartDomain.run(startServer);
  } else {
    throw err;
  }
});
serverStartDomain.run(startServer);

