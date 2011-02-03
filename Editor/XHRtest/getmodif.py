#!/usr/bin/env python
# getmodif.py: receive modifications from local copies.
# Copyright (c) 2011 Thaddee Tyl, Jan Keromnes.

import cgi

print "Content-Type: application/json"
print

# Json handling.
#import json

try:
  form = cgi.FieldStorage()
  msg = form.getfirst('diff')
  print msg
except:
  print '{"got":false}'
