/* server.js: run this with Node.js in the publish/ folder to start your server.
 * Copyright (c) 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * Code covered by the LGPL license. */


// Import the Camp
var Camp = require ('./lib/camp.js');


// Templating demo
Camp.handle('/template.html', function (data, path) {
  var map = {
     title: data.title || 'Success',
     enc: data.enc || 'utf-8',
     info: data.info || 'This document has been templated!'
  };
  return map;
});

// doctor ajax demo
var replies = ['Ok.', 'Oh⁉', 'Is that so?', 'How interesting!', 'Hm…', 'So say we all.']
Camp.add('doctor', function (data) {
  replies.push (data.text);
  return { reply: replies [ Math.floor ( Math.random() * replies.length ) ] };
});

// chat demo
var buffer = [];
Camp.add('talk', function(data){
  buffer.push(data.message);
});
Camp.add('all', function(data){
  // soup, guys
});

// not found demo
Camp.notfound(/.*/, function (data, path) {
  path[0] = '/404.html';
});

// let's rock'n'roll!
Camp.Server.start (80);
