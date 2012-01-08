/* server.js: run this with Node.js in the publish/ folder to start your server.
 * Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * Code covered by the LGPL license. */


// Options
var options = {
  port: +process.argv[2],
  secure: process.argv[3] === 'yes',
  debug: +process.argv[4]
};

// Let's rock'n'roll!
var camp = require('./camp/camp').start(options);

// Templating demo
camp.handle('/template.html', function (data, path) {
  return {    // Try http://localhost/template.html?title=Hello&info=[Redacted].
     title: data.title || 'Success',
     enc: data.enc || 'utf-8',
     info: data.info || 'This document has been templated!'
  };
});

// Doctor demo
var replies = ['Ok.', 'Oh⁉', 'Is that so?', 'How interesting!',
               'Hm…', 'What do you mean?', 'So say we all.'];
camp.add('doctor', function (data) {
  replies.push (data.text);
  return { reply: replies [ Math.floor ( Math.random() * replies.length ) ] };
});

// Chat demo
camp.add('talk', function(data) { camp.server.emit('all', data); });
camp.addDiffer('all', function() {}, function(data) { return data; });

// Not found demo
camp.notfound(/.*\.lol$/, function (data, path) { path[0] = '/404.html'; });

// Testing scout.js
camp.add('test', function(data) { return data || 'test'; });

