// Server demo. Run this with node to start your server.
// Copyright © 2011-2015 Thaddee Tyl, Jan Keromnes. All rights reserved.
// Code covered by the LGPL license.

// Let's rock'n'roll!
var port = +process.argv[2] || +process.env.PORT || 1234;
var camp = require('./lib/camp.js').start({
      port: port,
      secure: process.argv[3] === 'secure',
    })
  , ajax = camp.ajax
console.log('http://[::1]:' + port);

// Templating demo
camp.path('template.html');

// Templating demo with multiple templates and path parameter.
// /html.template/Hello/World
let flip = camp.template(['template.html', 'flip.html'])
camp.path('html.template/:title/:info', function(req, res) {
  res.template(req.data, flip);
});

// Doctor demo
var replies = ['Ok.', 'Oh⁉', 'Is that so?', 'How interesting!'
              ,'Hm…', 'What do you mean?', 'So say we all.']
ajax.on('doctor', function(data, end) {
  replies.push(data.text)
  end({reply:replies[Math.floor(Math.random() * replies.length)]})
})

// Chat demo
var chat = camp.eventSource('all')
ajax.on('talk', function(data, end) {chat.send(data); end()})

// WebSocket chat demo
camp.wsBroadcast('chat', function(data, end) {end(data)})

// Not found demo
camp.notFound('*.lol', function(req, res) { res.file('/404.html') })

// Basic authentication demo.
camp.path('secret', function(req, res) {
  if (req.username === 'Caesar' && req.password === '1234') {
    res.end('Congrats, you found it!');
  } else {
    res.statusCode = 401;
    res.setHeader('WWW-Authenticate', 'Basic');
    res.end('Nothing to hide here!');
  }
})

// Low-level handler
camp.handle(function(req, res, down) {
  res.setHeader('X-Open-Source', 'https://github.com/espadrine/sc/')
  down()
})

var stream = require('stream')
function streamFromString(str) {
  var newStream = new stream.Readable()
  newStream._read = function() { newStream.push(str); newStream.push(null) }
  return newStream
}
