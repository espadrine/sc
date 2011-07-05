/* server.js: run this with Node.js in the web/ folder to start your server.
 * Copyright (c) 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
 * Code covered by the LGPL license. */

// import the Camp server module for easy web & ajax
var Camp = require ('./lib/camp.js');

// templating information of the index page
Camp.format ('/index.html', function (arg) {
  var data = {
     title: arg.title || 'Success',
     h1: arg.h1 || 'Success!',
     p: arg.p || 'You\'re on the web!'
  };
  return data;
});

// let's rock'n'roll!
Camp.Server.start (80);
