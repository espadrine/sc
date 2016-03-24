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
camp.route('/template.html', function(data, match, end) {
  end({    // Try http://localhost/template.html?title=Hello&info=[Redacted].
    title: data.title || 'Success'
  , info: data.info || 'This document has been templated!'
  })
})

// Templating demo with multiple templates
camp.route('/html.template', function(data, match, end) {
  end({
    title: data.title || 'Success'
  , info: data.info || 'This document has been templated!'
  }, {
    template: ['template.html', 'flip.html']
  })
})

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
camp.notfound(/.*\.lol$/, function(data, match, end) {
  end(null, { template: '/404.html' })
})

// Basic authentication demo.
camp.route(/^\/secret$/, function(data, match, end, ask) {
  if (ask.username === 'Caesar' && ask.password === '1234') {
    end(null, {template: streamFromString('Congrats, you found it!')})
  } else {
    ask.res.statusCode = 401;
    ask.res.setHeader('WWW-Authenticate', 'Basic')
    end(null, {template: streamFromString('Nothing to hide here!')})
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
