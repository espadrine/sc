/* server.js: run this with Node.js in the publish/ folder to start your server.
 * Copyright (c) 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * Code covered by the LGPL license. */

// import the Camp
var Camp = require ('./lib/camp.js');

var replies = ['Ok.', 'Oh⁉', 'Is that so?', 'How interesting!', 'Hm…', 'So say we all.']

// handle ajax
Camp.add('doctor', function (data) {
  replies.push (data.text);
  return { reply: replies [ Math.floor ( Math.random() * replies.length ) ] };
});

// handle templating
Camp.handle ('/index.html', function (data, path) {
  var map = {
     title: data.title || 'Success',
     h1: data.h1 || 'Success!',
     p: data.p || 'You\'re on the web!'
  };
  return map;
});

// handle not found
Camp.notfound(/.*/, function (data, path) {
  path[0] = '/404.html';
});

// let's rock'n'roll!
Camp.Server.start (80);
