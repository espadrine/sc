#!/usr/local/python

# send a message.
import sys
import os
SENDMAIL = "/usr/sbin/sendmail"
p = os.popen("%s -t" % SENDMAIL, 'w')
p.write("To: thaddee.tyl@gmail.com\n")
p.write("Subject: Scout Camp\n")
p.write("\n")

import cgi
form = cgi.FieldStorage()
p.write(form['name'] + " speaking.\n")
p.write(form['msg'] + "\n")

p.close()
