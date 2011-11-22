#!/bin/sh

mkdir camp web web/js ScoutCamp

echo -e "\
<!doctype html>\n\
<meta charset=utf8>\n\
<title>Huge success!</title>\n\
<p>Huge success!</p>" > web/index.html

echo -e "\
/* server.js\n\
 */\n\n\
// import the camp\n\
var camp = require('./camp/camp'); \n\n\
// let's rock'n'roll!\n\
camp.start();" > server.js

wget "https://raw.github.com/espadrine/ScoutCamp/master/Makefile" && make update
