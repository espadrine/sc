#!/usr/bin/env python
# prog.py: test of sclib.js.
# This file is called by test.html.
# Copyright (c) 2010 Thaddee Tyl.

import cgi

print "Content-Type: application/json"
print

# Maybe do some json-get?
form = cgi.FieldStorage()
msg = form.getfirst('message')
msg = msg.replace('\\', '\\\\')

print '{"got": true, "message": "'+msg+'"}'