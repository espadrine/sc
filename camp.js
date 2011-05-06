/* camp.js: server-side Ajax handler that wraps around node.js.
 * Copyright (c) 2011 Thaddee Tyl. All rights reserved.
 */

var EventEmitter = require ('events').EventEmitter;

// Register ajax action.

exports.Server = new EventEmitter ();

exports.add = (function () {

  // The exports.add function is the following.
  var adder = function (action, callback, eventtolisten) {
  	exports.Server.Actions[action] = callback;
    if (eventtolisten) {
      // Encapsulate which event we listen to.
      exports.Server.Actions[action].listen = eventtolisten;
    }
  };

  exports.Server.Actions = {};    // This will be extended by the add function.
  
  return adder;
})();


exports.Server.mime = {
  'txt': 'text/plain',
  'html': 'text/html',
  'xhtml': 'text/html',
  'htm': 'text/html',
  'xml': 'text/xml',
  'css': 'text/css',
  'csv': 'text/csv',
  'dtd': 'application/xml-dtd',

  'js': 'application/javascript',
  'json': 'application/json',

  'pdf': 'application/pdf',
  'ps': 'application/postscript',
  'odt': 'application/vnd.oasis.opendocument.text',
  'ods': 'application/vnd.oasis.opendocument.spreadsheet',
  'odp': 'application/vnd.oasis.opendocument.presentation',
  'xls': 'application/vnd.ms-excel',
  'doc': 'application/vnd.msword',
  'ppt': 'application/vnd.ms-powerpoint',
  'xul': 'application/vnd.mozilla.xul+xml',
  'kml': 'application/vnd.google-earth.kml+xml',
  'dvi': 'application/x-dvi',
  'tex': 'application/x-latex',
  'ttf': 'application/x-font-ttf',
  'swf': 'application/x-shockwave-flash',
  'rar': 'application/x-rar-compressed',
  'zip': 'application/zip',
  'tar': 'application/x-tar',
  'gz': 'application/x-gzip',

  'ogg': 'audio/ogg',
  'mp3': 'audio/mpeg',
  'mpeg': 'audio/mpeg',
  'wav': 'audio/vnd.wave',
  'wma': 'audio/x-ms-wma',
  'gif': 'image/gif',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'svg': 'image/svg+xml',
  'tiff': 'image/tiff',
  'ico': 'image/vnd.microsoft.icon',
  'mp4': 'video/mp4',
  'ogv': 'video/ogg',
  'mov': 'video/quicktime',
  'webm': 'video/webm',
  'wmv': 'video/x-ms-wmv'
};

// Start function.

exports.Server.start = function (port, debug) {
  "use strict";
  port = port || 80;
  
  var http = require('http'),
      p = require('path'),
      fs = require('fs'),
      url = require('url'),
      qs = require('querystring');
  
  http.createServer(function(req,res){
    var uri = url.parse (req.url, true);
    var path = uri.pathname;
    var query = uri.query;
    
    try {
      if (debug) { console.log(path); } ///
      if (path.match (/\/$/)) {
        path = path + 'index.html';
      }
      var realpath = '.' + path;
      
      if (/^\/\$/.test (path)) {
        if (debug) { console.log ('validated action', path); } ///
        var action = path.slice (2);
        
        res.writeHead(200, {'Content-Type': exports.Server.mime['json']});

        /* Handler for when we get a data request. */
        var gotrequest = function (chunk) {

          /* Parse the chunk (it is an object literal). */
          query = qs.parse (unescape(chunk));
          for (var el in query) {
            try {
              query[el] = JSON.parse (unescape(query[el]));
            } catch (e) {
              console.log ('query:', JSON.stringify(query), e.toString());
            }
          }

          /* Launch the defined action. */
          if (exports.Server.Actions[action]) {
            var listen = exports.Server.Actions[action].listen;
            if (listen) {

              req.pause ();   // We must wait for an event to happen.
              exports.Server.on (listen, function listencb () {
                var args = [];    // The argument list to send to action.
                for (var i in arguments) { args.push (arguments[i]); }

                var resp = exports.Server.Actions[action].apply(query,
                             [query].concat(args));
                if (debug) { console.log ('event',listen,'yields',JSON.stringify(resp)); }
                if (resp) {
                  if (debug) { console.log ('subsequently writing it'); }
                  req.resume ();
                  res.end (JSON.stringify (resp));
                  // Remove callback.
                  exports.Server.removeListener (listen, listencb);
                }
              });

            } else {
              // It is not an event.
              var resp = JSON.stringify (
                  exports.Server.Actions[action].call (query, query)
                  );
              res.end (resp);
            }

          } else {
            res.end ('404');
          }

        };
        req.on ('data', gotrequest);
      
      } else {
        if (debug) { console.log ('validated', path); }  ///
        //TODO: make it a stream.
        var src = fs.readFileSync(realpath).toString();	    	
        
        /* What extension is it? */
        var ext = p.extname (realpath).slice (1);
        res.writeHead (200, {'Content-Type': exports.Server.mime[ext]});
        res.end (src);
      }
    	
    } catch(e) {
      res.writeHead (404, 'You killed me!');
      if (debug) { res.write(e.toString()); }
      res.end ('404: thou hast finished me!\n');
    }
  
  }).listen(port);
};
