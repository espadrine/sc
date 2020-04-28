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
var spdy = require('spdy');
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
  req.data = req.query;
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
  // Templates
  res.template = function(scope, templates) {
    // If there is no template.
    if (templates === undefined) {
      // We assume that the template is for a file on disk under documentRoot.
      var realpath = protectedPath(req.server.documentRoot, req.path);
      templates = [server.template(realpath)];
    }
    // If there is only one template.
    if (!(templates instanceof Array)) { templates = [templates]; }

    if (templates.length > 0) {
      res.mime(p.extname(templates[0].paths[0]).slice(1));
    }
    var templateStreams = templates.map(function(template) {
      if (typeof template === 'string') {
        return streamFromString(template);
      } else if (typeof template === 'function') {
        return template(scope);
      } else {
        log('Template ' + template + ' does not have a valid type', 'warn');
        return streamFromString('');
      }
    });
    var template = concatStreams(templateStreams);
    template.on('error', function(err) {
      log(err.stack, 'error');
      res.end('Not Found\n');
    });
    template.pipe(res.compressed());
  };
  // Sending a file
  res.file = function(path) {
    respondWithFile(req, res, path, function ifNoFile() {
      log('The file "' + path + '", which was meant to be sent back, ' +
          'was not found', 'error');
      res.statusCode = 404;
      res.end('Not Found\n');
    });
  };
  // Sending JSON data
  res.json = function (data, replacer, space) {
    res.setHeader('Content-Type', mime.json);
    var json = JSON.stringify(data, replacer, space) + (space ? '\n' : '');
    res.compressed().end(json);
  };
  res.compressed = function() {
    return getCompressedStream(req, res) || res;
  };
  res.redirect = function(path) {
    res.setHeader('Location', path);
    res.statusCode = 303;
    res.end();
  };
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
};

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

// We'll need to parse the query as a literal.
// Ask objects already have ask.query set after the URL query part.
// This function updates ask.query with:
// - application/x-www-form-urlencoded
// - multipart/form-data
function getQueries(req, end) {
  var urlencoded = /^application\/x-www-form-urlencoded/;
  var multipart = /^multipart\/form-data/;
  var contentType = req.headers['content-type'] || '';

  if (multipart.test(contentType)) {
    // Multipart data.
    req.form = req.form || new formidable.IncomingForm();
    req.form.multiples = true;
    req.form.parse(req, function(err, fields, files) {
      req.fields = fields;
      req.files = files;
      // Ensure that files are arrays.
      for (var key in req.files) {
        if (!(req.files[key] instanceof Array)) {
          req.files[key] = [req.files[key]];
        }
      }
      if (err == null) {
        addToQuery(req, req.fields);
        addToQuery(req, req.files);
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
      if (req.server.saveRequestChunks) {
        req.savedChunks = chunks;
      }
      var strquery = chunks? chunks.toString(): '';
      jsonFromQuery(strquery, req.query);
      end(err);
    });
  } else {
    // URL query parameters.
    var search = req.uri.search || '';
    jsonFromQuery(search.slice(1), req.query);
    end();
  }
}

// Return a writable response stream, using compression when possible.
function getCompressedStream(req, res) {
  var encoding = req.headers['accept-encoding'] || '';
  var stream;
  var contentEncodingHeader = res.getHeader('Content-Encoding');
  if ((contentEncodingHeader === 'gzip') || /\bgzip\b/.test(encoding)) {
    if (!contentEncodingHeader) {
      res.setHeader('Content-Encoding', 'gzip');
    }
    stream = zlib.createGzip();
    stream.pipe(res);
  } else if ((contentEncodingHeader === 'deflate') ||
      /\bdeflate\b/.test(encoding)) {
    if (!contentEncodingHeader) {
      res.setHeader('Content-Encoding', 'deflate');
    }
    stream = zlib.createDeflate();
    stream.pipe(res);
  }
  return stream;
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

// paths: paths to templating file (String), or to an Array of templating files.
// options:
// - reader: template reader function.
// - asString: use the string as a template, not as a file path.
// - callback: function taking a function(scope) → readableStream.
//   If you don't want the template creation to be synchronous, use this.
//   We return nothing from the function if `callback` is set.
// Returns a function(scope) → readableStream, unless `callback` is set.
function template(paths, options) {
  options = options || {};
  var callback = options.callback;
  var reader = options.reader || this.templateReader;

  // Deal with a list of paths in the general case.
  if (!(paths instanceof Array)) { paths = [paths]; }

  var input = '';
  if (!callback) {
    for (var i = 0, pathLen = paths.length; i < pathLen; i++) {
      if (options.asString) {
        input += paths[i];
      } else {
        input += '' + fs.readFileSync(paths[i]);
      }
    }
    var result = reader.create(input);
    result.paths = paths;
    return result;

  } else {
    // We have a callback.
    var pathLen = paths.length;
    var pathCounter = 0;
    paths.forEach(function(path, i) {
      if (options.asString) {
        var getInput = function(cb) { cb(path); };
      } else {
        var getInput = function(cb) {
          fs.readFile(path, function(err, string) {
            if (err != null) {
              log('Error reading template file:\n' + err, 'error');
              return cb('');
            }
            return cb('' + string);
          });
        };
      }
      getInput(function(fileInput) {
        pathCounter++;
        input += fileInput;

        if (pathCounter >= pathLen) {
          var result = reader.create(input);
          result.paths = paths;
          callback(result);
        }
      });
    });
  }
}




// Camp class is classy.
//
// Camp has a router function that returns the stack of functions to call, one
// after the other, in order to process the request.

function augmentServer(server, opts) {
  server.templateReader = opts.templateReader || templateReader;
  server.documentRoot = opts.documentRoot || p.join(process.cwd(), 'web');
  server.saveRequestChunks = !!opts.saveRequestChunks;
  server.template = template;
  server.stack = [];
  server.stackInsertion = 0;
  defaultRoute.forEach(function(mkfn) { server.handle(mkfn(server)); });
  server.stackInsertion = 0;
  server.on('request', function(req, res) { listener(server, req, res) });
}

function Camp(opts) {
  http.Server.call(this);
  augmentServer(this, opts);
}
inherits(Camp, http.Server);

function SecureCamp(opts) {
  https.Server.call(this, opts);
  augmentServer(this, opts);
}
inherits(SecureCamp, https.Server);

function SpdyCamp(opts) {
  spdy.Server.call(this, opts);
  augmentServer(this, opts);
}
inherits(SpdyCamp, spdy.Server);

Camp.prototype.handle = SecureCamp.prototype.handle = SpdyCamp.prototype.handle =
function handle(fn) {
  this.stack.splice(this.stackInsertion, 0, fn);
  this.stackInsertion++;
};

Camp.prototype.removeHandler = SecureCamp.prototype.removeHandler = SpdyCamp.prototype.removeHandler =
function removeHandler(fn) {
  var index = this.stack.indexOf(fn);
  if (index < 0) { return; }
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
      ask.res.end('Internal Server Error\n');
    }
  });
}


// On-demand loading of socket.io.
Camp.prototype.socketIo = SecureCamp.prototype.socketIo = SpdyCamp.prototype.socketIo
                        = null;
var socketIoProperty = {
  get: function() {
    if (this.socketIo === null) {
      this.socketIo = require('socket.io')(this, {path: '/$socket.io'});
      // Add socketUnit only once.
      this.stack.unshift(socketUnit(this));
    }
    return this.socketIo;
  },
};
Object.defineProperty(Camp.prototype,       'io', socketIoProperty);
Object.defineProperty(SecureCamp.prototype, 'io', socketIoProperty);
Object.defineProperty(SpdyCamp.prototype,   'io', socketIoProperty);



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
    if (channel[0] !== '/') {
      channel = '/$websocket:' + channel;  // Deprecated API.
    }
    if (chanPool[channel] !== undefined) {
      chanPool[channel].close();
    }
    chanPool[channel] = new WebSocket.Server({
      server: server,
      path: channel,
    });
    chanPool[channel].on('connection', conListener);
    return chanPool[channel];
  };
  // WebSocket broadcast API.
  // webBroadcast(channel :: String, recvListener :: function(data, end))
  server.wsBroadcast = function wsBroadcast (channel, recvListener) {
    if (channel[0] === '/') {
      return server.ws(channel, function (socket) {
        socket.on('message', function wsBroadcastRecv (data, flags) {
          recvListener({data: data, flags: flags}, {
            send: function wsBroadcastSend (dataBack) {
              chanPool[channel].clients.forEach(function (s) {
                s.send(dataBack);
              });
            },
          });
        });
      });
    } else { // Deprecated API
      return server.ws(channel, function (socket) {
        socket.on('message', function wsBroadcastRecv (data, flags) {
          recvListener(data, function wsBroadcastSend (dataBack) {
            chanPool[channel].clients.forEach(function (s) { s.send(dataBack); });
          });
        });
      });
    }
  };

  return function wsLayer (req, res, next) {
    // This doesn't actually get run, since ws overrides it at the root.
    if (chanPool[req.path] === undefined) return next();
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
          res.compressed().end(JSON.stringify(data || {}));
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
    if (channel[0] !== '/') { channel = '/$' + channel; }
    return sources[channel] = new Source();
  }

  server.eventSource = eventSource;


  return function eventSourceLayer (req, res, next) {
    if (sources[req.path] === undefined) return next();
    var source = sources[req.path];
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
  return p.join(documentRoot, p.join('/', path));
}

// End the response `res` with file at path `path`.
// If the file does not exist, we call `ifNoFile()`.
function respondWithFile(req, res, path, ifNoFile) {
  ifNoFile = ifNoFile || function() {};
  // We use `documentRoot` as the root wherein we seek files.
  var realpath = protectedPath(req.server.documentRoot, path);
  fs.stat(realpath, function(err, stats) {
    if (err) return ifNoFile();

    if (stats.isDirectory()) {
      realpath = p.join(realpath, 'index.html');
    }
    res.mime(p.extname(realpath).slice(1));

    // Cache management (compare timestamps at second-level precision).
    var lastModified = Math.floor(stats.mtime / 1000);
    var since = req.headers['if-modified-since'];
    if (since && (lastModified <= Math.floor(new Date(since) / 1000))) {
      res.statusCode = 304; // not modified.
      res.end();
      return;
    }
    res.setHeader('Last-Modified', stats.mtime.toUTCString());

    // Connect the output of the file to the network!
    var raw = fs.createReadStream(realpath);
    raw.on('error', function(err) {
      log(err.stack, 'error');
      res.statusCode = 404;
      res.end('Not Found\n');
    });
    raw.pipe(res.compressed());
  });
}

// Static unit.
function staticUnit (server) {
  return function staticLayer (req, res, next) {
    respondWithFile(req, res, req.path, next);
  };
}

function escapeRegex(string) {
  return string.replace(/[-\/\\^$+?.()|[\]{}]/g, '\\$&');
}

// Convert a String to a RegExp, escaping everything.
// Make * stand for anything and :foo be a named non-slash placeholder.
// ** is a star, :: is a colon.
function regexFromString(string) {
  var r = /::|\*\*|:[a-zA-Z_]+|\*/g;
  var match;
  var regexString = '^';
  var previousIndex = 0;
  var regexKeys = [];
  var starKey = 0;
  while ((match = r.exec(string)) !== null) {
    var matched = match[0];
    var index = match.index;
    regexString += escapeRegex(string.slice(previousIndex, index));
    previousIndex = index;
    if (matched === '**') {
      regexString += '\\*\\*';
      previousIndex += 2;
    } else if (matched === '::') {
      regexString += '::';
      previousIndex += 2;
    } else if (matched === '*') {
      regexString += '(.*)';
      regexKeys.push(starKey);
      previousIndex += 1;
      starKey++;
    } else {  // :foo
      regexString += '([^/]+)';
      regexKeys.push(matched.slice(1));
      previousIndex += matched.length;
    }
  }
  regexString += escapeRegex(string.slice(previousIndex)) + '$';
  var regex = new RegExp(regexString);
  regex.keys = regexKeys;
  return regex;
}

function Path(matcher) {
  this.matcher = matcher;
  if (matcher instanceof RegExp) {
    this.match = function(path) {
      return path.match(matcher);
    };
  } else if (typeof matcher === 'string') {
    if (matcher[0] !== '/' && matcher[0] !== '*') {
      matcher = '/' + matcher;
    }
    if (/[:*]/.test(matcher)) {
      matcher = regexFromString(matcher);
    }

    // Takes a String path. If the matcher doesn't match it, return null;
    // otherwise, return an object mapping keys (from the matcher) to the String
    // corresponding to it in the path. Matchers like :foo have key 'foo',
    // matchers like * have an integer key starting from 0.
    this.match = function(path) {
      var matched;
      if ((typeof matcher === 'string') && (path === matcher)) {
        return {};
      } else if ((matcher instanceof RegExp)
        && (matched = matcher.exec(path))) {
        var data = {};
        for (var i = 0; i < matcher.keys.length; i++) {
          var key = matcher.keys[i];
          var value = matched[i + 1];
          data[key] = value;
        }
        return data;
      } else { return null; }
    };
  }
}

// Path-like unit.
//
// The optional `httpMethods` array allows specifying which HTTP methods should
// have their own specific helpers like `server.get()`, `server.post()`, etc.
// Warning: Calling `pathLikeUnit` several times with the same HTTP methods will
// overwrite any corresponding `server[method]` helpers!
function pathLikeUnit(serverMethod, statusCode, httpMethods) {
  httpMethods = httpMethods || [];
  return function pathLikeUnit(server) {
    var callbacks = [];

    var addCallback = function (path, callback) {
      callbacks.push({
        path: new Path(path),
        methods: null,
        callback: callback
      });
    };
    server[serverMethod] = addCallback;

    // HTTP method-specific helpers like server.get(), server.post(), etc.
    httpMethods.forEach(function (method) {
      server[method.toLowerCase()] = function (path, callback) {
        callbacks.push({
          path: new Path(path),
          methods: [method],
          callback: callback
        });
      };
    });

    return function pathLayer (req, res, next) {
      var pathLen = callbacks.length;
      var matched = null;
      var cbindex = -1;
      for (var i = 0; i < pathLen; i++) {
        matched = callbacks[i].path.match(req.path);
        if (matched == null) {
          continue;
        }
        var methods = callbacks[i].methods;
        if (methods != null && methods.indexOf(req.method) === -1) {
          continue;
        }
        cbindex = i; break;
      }
      if (cbindex >= 0) {
        getQueries(req, function(err) {
          if (err != null) {
            log('While getting queries for ' + req.url + ' in pathUnit:\n'
              + err.stack, 'error');
          }
          for (var key in matched) {
            req.data[key] = matched[key];
          }
          res.statusCode = statusCode;
          var cb = callbacks[cbindex] && callbacks[cbindex].callback;
          if (cb != null) {
            cb(req, res);
          } else {
            res.template(req.data);
          }
        });
      } else { next(); }
    };
  };
}
var pathUnit = pathLikeUnit('path', 200, http.METHODS);
var notFoundUnit = pathLikeUnit('notFound', 404);

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
      res.end('Not Found\n');
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

        var template = concatStreams(templates);

        template.on('error', function(err) {
          log(err.stack, 'error');
          res.end('Not Found\n');
        });

        if (params === null || reader === null) {
          // No data was given. Same behaviour as static.
          template.pipe(res);
        } else {
          reader(template, res, params, function errorcb(err) {
            if (err) {
              log(err.stack, 'error');
              res.end('Not Found\n');
            }
          });
        }
      }, req.ask);
    }
  });
}

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
                    pathUnit, routeUnit, staticUnit,
                    notFoundUnit, notfoundUnit];

function streamFromString(string) {
  var sstream = new stream.Readable();
  sstream._read = function() { sstream.push(string); sstream.push(null); };
  return sstream;
}






// Internal start function.
//

function createServer () { return new Camp(); }

function createSecureServer (opts) { return new SecureCamp(opts); }

function createSpdyServer (opts) { return new SpdyCamp(opts); }

var KEY_HEADER = /^-+BEGIN \w+ PRIVATE KEY-+/;
var CERT_HEADER = /^-+BEGIN CERTIFICATE-+/;
function createServerWithSettings (settings) {
  var server;
  settings.hostname = settings.hostname || '::';

  // Are we running https?
  if (settings.secure) { // Yep
    var key, cert;
    if (KEY_HEADER.test(settings.key)) {
      key = settings.key;
    } else {
      key = fs.readFileSync(settings.key);
    }
    if (CERT_HEADER.test(settings.cert)) {
      cert = settings.cert;
    } else {
      cert = fs.readFileSync(settings.cert);
    }
    settings.key  = key;
    settings.cert = cert;
    settings.ca   = settings.ca.map(function(file) {
      try {
        var ca;
        if (CERT_HEADER.test(file)) {
          ca = file;
        } else {
          ca = fs.readFileSync(file);
        }
        return ca;
      } catch (e) { log('CA file not found: ' + file, 'error'); }
    });
    if (settings.spdy === false) {
      server = new SecureCamp(settings);
    } else {
      server = new SpdyCamp(settings);
    }
  } else { // Nope
    server = new Camp(settings);
  }
  if (settings.setuid) {
    server.on('listening', function switchuid() {
      process.setuid(settings.setuid);
    });
  }

  server.listenAsConfigured = function() {
    return this.listen(settings.port, settings.hostname);
  }

  return server;
}


// Each camp instance creates an HTTP / HTTPS server automatically.
//
function create (settings) {

  settings = settings || {};

  // Populate security values with the corresponding files.
  if (settings.secure) {
    settings.passphrase = settings.passphrase || '1234';
    settings.key = settings.key || 'https.key';
    settings.cert = settings.cert || 'https.crt';
    settings.ca = settings.ca || [];
  }

  settings.port = settings.port || (settings.secure ? 443 : 80);

  return createServerWithSettings(settings);
};

function start (settings) {
  return create(settings).listenAsConfigured();
}


exports.create = create;
exports.start = start;
exports.createServer = createServer;
exports.createSecureServer = createSecureServer;
exports.Camp = Camp;
exports.SecureCamp = SecureCamp;
exports.SpdyCamp = SpdyCamp;

exports.genericUnit = genericUnit;
exports.socketUnit = socketUnit;
exports.wsUnit = wsUnit;
exports.ajaxUnit = ajaxUnit;
exports.eventSourceUnit = eventSourceUnit;
exports.pathUnit = pathUnit;
exports.routeUnit = routeUnit;
exports.staticUnit = staticUnit;
exports.notfoundUnit = notfoundUnit;

exports.template = template;
exports.templateReader = templateReader;
exports.augmentReqRes = augmentReqRes;
exports.mime = mime;
exports.binaries = binaries;
exports.log = log;
