// Server-side Ajax handler that wraps around node.js.
// Copyright © Thaddee Tyl, Jan Keromnes. All rights reserved.
// Code covered by the LGPL license.

"use strict";

var templateReader = require('fleau');
var formidable = require('formidable');
var WebSocket = require('ws');
var Cookies = require('cookies');

var EventEmitter = require ('events').EventEmitter;
var inherits = require('util').inherits;
var http = require('http');
var https = require('https');
var log = require('multilog');
var p = require('path');
var fs = require('fs');
var url = require('url');
var zlib = require('zlib');
var stream = require('stream');
var querystring = require('querystring');

// Logs.
log.pipe('warn', 'all');
log.pipe('error', 'all');
log.pipe('error', 'stderr');
log.pipe('warn', 'stderr');




var mime = require('./mime.json');
var binaries = [
      'pdf', 'ps', 'odt', 'ods', 'odp', 'xls', 'doc', 'ppt', 'dvi', 'ttf',
      'swf', 'rar', 'zip', 'tar', 'gz', 'ogg', 'mp3', 'mpeg', 'wav', 'wma',
      'gif', 'jpg', 'jpeg', 'png', 'svg', 'tiff', 'ico', 'mp4', 'ogv', 'mov',
      'webm', 'wmv'
];


// Augment IncomingMessage and ServerResponse.
function augmentReqRes(req, res, server) {
  req.server = server;
  req.uri = url.parse(req.url, true);
  // The form is used for multipart data.
  req.form = undefined;
  try {
    req.path = decodeURIComponent(req.uri.pathname);
  } catch(e) {  // Using `escape` should not kill the server.
    req.path = unescape(req.uri.pathname);
  }
  req.query = req.uri.query;
  // Check (and add fields) for basic authentication.
  req.username = undefined;
  req.password = undefined;
  if (req.headers.authorization) {
    var authorization = req.headers.authorization;
    var authComponent = authorization.split(/\s+/);
    if (authComponent[0] === 'Basic') {
      // Username / password.
      var up = new Buffer(authComponent[1], 'base64').toString().split(':');
      req.username = up[0];
      req.password = up[1];
    }
  }
  // Cookies
  req.cookies = new Cookies(req, res);
}

// Set a content type based on a file extension.
http.ServerResponse.prototype.mime =
function mimeFromExt(ext) {
  this.setHeader('Content-Type', mime[ext] || 'text/plain');
}

// Ask is a model of the client's request / response environment.
// It will be slowly deprecated.
function Ask(server, req, res) {
  this.server = server;
  this.req = req;
  this.res = res;
  this.uri = req.uri;
  this.form = req.form;
  this.path = req.path;
  this.query = req.query;
  this.username = req.username;
  this.password = req.password;
  this.cookies = req.cookies;
}

// Set the mime type of the response.
Ask.prototype.mime = function (type) {
  this.res.setHeader('Content-Type', type);
}

function addToQuery(ask, obj) {
  for (var item in obj) {
    ask.query[item] = obj[item];
  }
}

function jsonFromQuery(query, obj) {
  obj = obj || Object.create(null);
  // First attempt to decode the query as JSON
  // (ie, 'foo="bar"&baz={"something":"else"}').
  try {
    var items = query.split('&');
    for (var i = 0; i < items.length; i++) {
      // Each element of key=value is then again split along `=`.
      var elems = items[i].split('=');
      obj[decodeURIComponent(elems[0])] =
        JSON.parse(decodeURIComponent(elems[1]));
    }
  } catch(e) {
    // Couldn't parse as JSON.
    try {
      var newobj = querystring.parse(query);
    } catch(e) {
      log('Error while parsing query ', JSON.stringify(query) + '\n'
        + '(' + e.toString() + ')\n'
        , 'error');
    }
    var keys = Object.keys(newobj);
    for (var i = 0; i < keys.length; i++) {
      obj[keys[i]] = newobj[keys[i]];
    }
  }
}

// We'll need to parse the query (either POST or GET) as a literal.
// Ask objects already have ask.query set after the URL query part.
// This function updates ask.query with:
// - application/x-www-form-urlencoded
// - multipart/form-data
function getQueries(req, end) {
  jsonFromQuery(req.uri.search.slice(1), req.query);
  if (req.method === 'GET' || req.method === 'HEAD') {
    end(null);  // It's already parsed in req.query.
  } else if (req.method === 'POST') {
    var urlencoded = /^application\/x-www-form-urlencoded/;
    var multipart = /^multipart\/form-data/;
    var contentType = req.headers['content-type'] || '';

    if (multipart.test(contentType)) {
      // Multipart data.
      req.form = req.form || new formidable.IncomingForm();
      req.form.parse(req, function(err, fields, files) {
        if (err == null) {
          addToQuery(req, fields);
          addToQuery(req, files);
        }
        end(err);
      });

    } else if (urlencoded.test(contentType)) {
      // URL encoded data.
      var chunks;
      var gotrequest = function (chunk) {
        if (chunk !== undefined) {
          if (chunks === undefined) {
            chunks = chunk;
          } else {
            chunks = Buffer.concat([chunks, chunk]);
          }
        }
      };
      req.on('data', gotrequest);
      req.on('end', function(err) {
        var strquery = chunks? chunks.toString(): '';
        jsonFromQuery(strquery, req.query);
        end(err);
      });
    } else {
      jsonFromQuery(req.uri.search.slice(1), req.query);
      end();
    }
  }
}

// Return a writable response stream, using compression when possible.
function getCompressedStream(req, res) {
  var encoding = req.headers['accept-encoding'] || '';
  if (encoding.match(/\bgzip\b/)) {
    res.setHeader('content-encoding', 'gzip');
    var oldres = res;
    res = zlib.createGzip();
    res.pipe(oldres);
  } else if (encoding.match(/\bdeflate\b/)) {
    res.setHeader('content-encoding', 'deflate');
    var oldres = res;
    res = zlib.createDeflate();
    res.pipe(oldres);
  }
  return res;
}

// Concatenate an array of streams into a single stream.
function concatStreams(array) {
  var concat = new stream.PassThrough();

  function pipe(i) {
    if (i < array.length - 1) {
      array[i].pipe(concat, {end: false});
      array[i].on('end', function () { pipe(i + 1) });
    } else {
      array[i].pipe(concat);
    }
  }
  if (array.length > 0) {
    pipe(0);
  }

  return concat;
}




// Camp class is classy.
//
// Camp has a router function that returns the stack of functions to call, one
// after the other, in order to process the request.

function Camp(opts) {
  var self = this;
  http.Server.call(self);
  self.templateReader = opts.templateReader || templateReader;
  self.documentRoot = opts.documentRoot || p.join(process.cwd(), 'web');
  self.stack = [];
  self.stackInsertion = 0;
  defaultRoute.forEach(function(mkfn) { self.handle(mkfn(self)); });
  self.stackInsertion = 0;
  self.on('request', function(req, res) { listener(self, req, res) });
}
inherits(Camp, http.Server);

function SecureCamp(opts) {
  var self = this;
  https.Server.call(self, opts);
  self.templateReader = opts.templateReader || templateReader;
  self.documentRoot = opts.documentRoot || p.join(process.cwd(), 'web');
  self.stack = [];
  self.stackInsertion = 0;
  defaultRoute.forEach(function(mkfn) { self.handle(mkfn(self)); });
  self.stackInsertion = 0;
  self.on('request', function(req, res) { listener(self, req, res) });
}
inherits(SecureCamp, https.Server);

Camp.prototype.handle = SecureCamp.prototype.handle =
function handle(fn) {
  this.stack.splice(this.stackInsertion, 0, fn);
  this.stackInsertion++;
};

Camp.prototype.removeHandler = SecureCamp.prototype.removeHandler =
function removeHandler(fn) {
  var index = this.stack.indexOf(fn);
  if (index < this.stackInsertion) {
    this.stackInsertion--;
  }
  this.stack.splice(index, 1);
};

// Default request listener.

function listener(server, req, res) {
  augmentReqRes(req, res, server);
  var ask = new Ask(server, req, res);
  req.ask = ask;  // Legacy.
  bubble(ask, 0);
}

// The bubble goes through each layer of the stack until it reaches the surface.
// The surface is a Server Error, btw.
function bubble(ask, layer) {
  ask.server.stack[layer](ask.req, ask.res, function next() {
    if (ask.server.stack.length > layer + 1) bubble(ask, layer + 1);
    else {
      ask.res.statusCode = 500;
      ask.res.end('500\n');
    }
  });
}


// On-demand loading of socket.io.
Camp.prototype.socketIo = SecureCamp.prototype.socketIo
                        = null;
var socketIoProperty = {
  get: function() {
    if (this.socketIo === null) {
      this.socketIo = require('socket.io').listen(this);
      // Add socketUnit only once.
      this.stack.unshift(socketUnit(this));
    }
    return this.socketIo;
  },
};
Object.defineProperty(Camp.prototype,       'io', socketIoProperty);
Object.defineProperty(SecureCamp.prototype, 'io', socketIoProperty);



// The default routing function:
//
// - if the request is of the form /$socket.io, it runs the socket.io unit.
//   (By default, that is not in. Using `server.io` loads the library.)
// - if the request is of the form /$websocket:, it runs the websocket unit.
// - if the request is of the form /$..., it runs the ajax / eventSource unit.
// - if the request is a registered template, it runs the template unit.
// - if the request isn't a registered route, it runs the static unit.
// - else, it runs the notfound unit.

var defaultRoute = [genericUnit, wsUnit, ajaxUnit, eventSourceUnit,
                    routeUnit, staticUnit, notfoundUnit];

// Generic unit. Deprecated.
function genericUnit (server) {
  var processors = [];
  server.handler = function (f) { processors.push(f); };
  return function genericLayer (req, res, next) {
    for (var i = 0; i < processors.length; i++) {
      var keep = processors[i](req.ask);
      if (keep) { return; }  // Don't call next, nor the rest.
    }
    next();  // We never catch that request.
  };
}

// Socket.io unit.
function socketUnit (server) {
  var io = server.io;
  // Client-side: <script src="/$socket.io/socket.io.js"></script>
  function ioConf() { io.set('resource', '/$socket.io'); }
  io.configure('development', ioConf);
  io.configure('production', ioConf);

  return function socketLayer (req, res, next) {
    // Socket.io doesn't care about anything but /$socket.io now.
    if (req.path.slice(1, 11) !== '$socket.io') next();
  };
}

// WebSocket unit.
function wsUnit (server) {
  var chanPool = server.wsChannels = {};
  // Main WebSocket API:
  // ws(channel :: String, conListener :: function(socket))
  server.ws = function ws (channel, conListener) {
    if (chanPool[channel] !== undefined) {
      chanPool[channel].close(1000, 'Channel replaced');
    }
    chanPool[channel] = new WebSocket.Server({
      server: server,
      path: '/$websocket:' + channel,
    });
    chanPool[channel].on('connection', conListener);
    return chanPool[channel];
  };
  // WebSocket broadcast API.
  // webBroadcast(channel :: String, recvListener :: function(data, end))
  server.wsBroadcast = function wsBroadcast (channel, recvListener) {
    server.ws(channel, function (socket) {
      socket.on('message', function wsBroadcastRecv (data, flags) {
        recvListener(data, function wsBroadcastSend (dataBack) {
          chanPool[channel].clients.forEach(function (s) { s.send(dataBack); });
        });
      });
    });
  };

  return function wsLayer (req, res, next) {
    // This doesn't actually get run, since ws overrides it at the root.
    if (req.path.slice(1, 12) !== '$websocket:') return next();
  };
}

// Ajax unit.
function ajaxUnit (server) {
  var ajax = server.ajax = new EventEmitter();
  // Register events to be fired before loading the ajax data.
  var ajaxReq = server.ajaxReq = new EventEmitter();

  return function ajaxLayer (req, res, next) {
    if (req.path[1] !== '$') { return next(); }
    var action = req.path.slice(2);

    if (ajax.listeners(action).length <= 0) { return next(); }

    res.setHeader('Content-Type', mime.json);

    ajaxReq.emit(action, req.ask);
    // Get all data requests.
    getQueries(req, function(err) {
      if (err == null) {
        ajax.emit(action, req.query, function ajaxEnd(data) {
          res.end(JSON.stringify(data || {}));
        }, req.ask);
      } else {
        log('While parsing', req.url + ':\n'
          + err
          , 'error');
        return next();
      }
    });
  };
}


// EventSource unit.
//
// Note: great inspiration was taken from Remy Sharp's code.
function eventSourceUnit (server) {
  var sources = {};

  function Source () {
    this.conn = [];
    this.history = [];
    this.lastMsgId = 0;
  }

  Source.prototype.removeConn = function(res) {
    var i = this.conn.indexOf(res);
    if (i !== -1) {
      this.conn.splice(i, 1);
    }
  };

  Source.prototype.sendSSE = function (res, id, event, message) {
    var data = '';
    if (event !== null) {
      data += 'event:' + event + '\n';
    }

    // Blank id resets the id counter.
    if (id !== null) {
      data += 'id:' + id + '\n';
    } else {
      data += 'id\n';
    }

    if (message) {
      data += 'data:' + message.split('\n').join('\ndata:') + '\n';
    }
    data += '\n';

    res.write(data);

    if (res.hasOwnProperty('xhr')) {
      clearTimeout(res.xhr);
      var self = this;
      res.xhr = setTimeout(function () {
        res.end();
        self.removeConn(res);
      }, 250);
    }
  };

  Source.prototype.emit = function (event, msg) {
    this.lastMsgId++;
    this.history.push({
      id: this.lastMsgId,
      event: event,
      msg: msg
    });

    for (var i = 0; i < this.conn.length; i++) {
      this.sendSSE(this.conn[i], this.lastMsgId, event, msg);
    }
  }

  Source.prototype.send = function (msg) {
    this.emit(null, JSON.stringify(msg));
  }

  function eventSource (channel) {
    return sources[channel] = new Source();
  }

  server.eventSource = eventSource;


  return function eventSourceLayer (req, res, next) {
    if (req.path[1] !== '$') return next();
    var action = req.path.slice(2);
    var source = sources[action];
    if (!source || req.headers.accept !== 'text/event-stream')
      return next();    // Don't bother if the client cannot handle it.

    // Remy Sharp's Polyfill support.
    if (req.headers['x-requested-with'] == 'XMLHttpRequest') {
      res.xhr = null;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');

    if (req.headers['last-event-id']) {
      var id = parseInt(req.headers['last-event-id']);
      for (var i = 0; i < source.history.length; i++)
        if (source.history[i].id > id)
          source.sendSSE(res, source.history[i].id,
              source.history[i].event, source.history[i].msg);
    } else res.write('id\n\n');      // Reset id.

    source.conn.push(res);

    // Every 15s, send a comment (avoids proxy dropping HTTP connection).
    var to = setInterval(function () {res.write(':\n');}, 15000);

    // This can only end in blood.
    req.on('close', function () {
      source.removeConn(res);
      clearInterval(to);
    });
  };
}

function protectedPath(documentRoot, path) {
  var rpath = p.relative(documentRoot, path).replace(/^(\.\.[\/\\]?)+/, '');
  return p.resolve(documentRoot, rpath);
}

// Static unit.
function staticUnit (server) {
  var documentRoot = server.documentRoot;

  return function staticLayer (req, res, next) {
    // We use `documentRoot` as the root wherein we seek files.
    var realpath = protectedPath(documentRoot, p.join(documentRoot, req.path));
    fs.stat(realpath, function(err, stats) {
      if (err) return next();
      res.mime(p.extname(req.path).slice(1));

      if (stats.isDirectory()) {
        realpath = p.join(realpath, 'index.html');
        res.mime('html');
      }

      // Cache management.
      if (+(new Date(req.headers['if-modified-since'])) >= +stats.mtime) {
        res.statusCode = 304;
        res.end();  // not modified.
        return;
      }
      res.setHeader('Last-Modified', stats.mtime.toGMTString());

      // Connect the output of the file to the network!
      var raw = fs.createReadStream(realpath);
      res = getCompressedStream(req, res);
      raw.on('error', function(err) {
        log(err.stack, 'error');
        res.statusCode = 404;
        res.end('404\n');
      });
      raw.pipe(res);
    });
  };
}

// Template unit.
function routeUnit (server) {
  var regexes = [];
  var callbacks = [];

  function route (paths, literalCall) {
    regexes.push(RegExp(paths));
    callbacks.push(literalCall);
  }

  server.route = route;

  return function routeLayer (req, res, next) {
    var matched = null;
    var cbindex = -1;
    for (var i = 0; i < regexes.length; i++) {
      matched = req.path.match (regexes[i]);
      if (matched !== null) { cbindex = i; break; }
    }
    if (cbindex >= 0) {
      catchpath(req, res, matched, callbacks[cbindex], server.templateReader);
    } else {
      next();
    }
  };
}

// Not Fount unit — in fact, mostly a copy&paste of the route unit.
function notfoundUnit (server) {
  var regexes = [];
  var callbacks = [];

  function notfound (paths, literalCall) {
    regexes.push(RegExp(paths));
    callbacks.push(literalCall);
  }

  server.notfound = notfound;

  return function notfoundLayer (req, res) {
    res.statusCode = 404;
    var matched = null;
    var cbindex = -1;
    for (var i = 0; i < regexes.length; i++) {
      matched = req.path.match (regexes[i]);
      if (matched !== null) { cbindex = i; break; }
    }
    if (cbindex >= 0) {
      catchpath(req, res, matched, callbacks[cbindex], server.templateReader);
    } else {
      res.end('404\n');
    }
  };
}

// Route *and* not found units — see what I did there?

function catchpath (req, res, pathmatch, callback, templateReader) {
  getQueries(req, function gotQueries(err) {
    if (err != null) {
      log('While getting queries for ' + req.uri + ':\n'
        + err
        , 'error');
    } else {
      // params: template parameters (JSON-serializable).
      callback(req.query, pathmatch, function end (params, options) {
        options = options || {};
        var templates = options.template || pathmatch[0];
        var reader = options.reader || templateReader;
        if (Object(options.string) instanceof String) {
          templates = [streamFromString(options.string)];
        } else if (Object(params) instanceof String) {
          templates = [streamFromString(params)];
        } else if (!Array.isArray(templates)) {
          templates = [templates];
        }
        if (!res.getHeader('Content-Type')  // Allow overriding.
            && (Object(templates[0]) instanceof String)) {
          res.mime(p.extname(templates[0]).slice(1));
        }
        for (var i = 0; i < templates.length; i++) {
          if (Object(templates[i]) instanceof String) {
            // `templates[i]` is a string path for a file.
            var templatePath = p.join(req.server.documentRoot, templates[i]);
            templates[i] = fs.createReadStream(templatePath);
          }
        }

        res = getCompressedStream(req, res);
        var template = concatStreams(templates);

        template.on('error', function(err) {
          log(err.stack, 'error');
          res.end('404\n');
        });

        if (params === null || reader === null) {
          // No data was given. Same behaviour as static.
          template.pipe(res);
        } else {
          reader(template, res, params, function errorcb(err) {
            if (err) {
              log(err.stack, 'error');
              res.end('404\n');
            }
          });
        }
      }, req.ask);
    }
  });
}

function streamFromString(string) {
  var sstream = new stream.Readable();
  sstream._read = function() { sstream.push(string); sstream.push(null); };
  return sstream;
}






// Internal start function.
//

function createServer () { return new Camp(); }

function createSecureServer (opts) { return new SecureCamp(opts); }

function startServer (settings) {
  var server;
  settings.hostname = settings.hostname || '::';

  // Are we running https?
  if (settings.secure) { // Yep
    settings.key  = fs.readFileSync(settings.key);
    settings.cert = fs.readFileSync(settings.cert);
    settings.ca   = settings.ca.map(function(file) {
      try {
        var ca = fs.readFileSync(file);
        return ca;
      } catch (e) { log('CA file not found: ' + file, 'error'); }
    });
    server = new SecureCamp(settings).listen(settings.port, settings.hostname);
  } else { // Nope
    server = new Camp(settings).listen(settings.port, settings.hostname);
  }
  if (settings.setuid) {
    server.on('listening', function switchuid() {
      process.setuid(settings.setuid);
    });
  }

  return server;
}


// Each camp instance creates an HTTP / HTTPS server automatically.
//
function start (settings) {

  settings = settings || {};

  // Populate security values with the corresponding files.
  if (settings.secure) {
    settings.passphrase = settings.passphrase || '1234';
    settings.key = settings.key || 'https.key';
    settings.cert = settings.cert || 'https.crt';
    settings.ca = settings.ca || [];
  }

  settings.port = settings.port || (settings.secure ? 443 : 80);

  return startServer(settings);
};


exports.start = start;
exports.createServer = createServer;
exports.createSecureServer = createSecureServer;
exports.Camp = Camp;
exports.SecureCamp = SecureCamp;

exports.genericUnit = genericUnit;
exports.socketUnit = socketUnit;
exports.wsUnit = wsUnit;
exports.ajaxUnit = ajaxUnit;
exports.eventSourceUnit = eventSourceUnit;
exports.routeUnit = routeUnit;
exports.staticUnit = staticUnit;
exports.notfoundUnit = notfoundUnit;

exports.templateReader = templateReader;
exports.mime = mime;
exports.binaries = binaries;
exports.log = log;
