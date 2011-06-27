// server.js: run this with Node.js in the web/ folder to start your server
// Copyright (c) 2011 Jan Keromnes & Yann Tyl. No rights reserved.

// import the Camp server module for easy web & ajax
var Camp = require ('./lib/camp.js');

// let's rock'n'roll!
Camp.Server.start (80, true);


