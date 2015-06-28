# Makefile: Publish your website, start/stop your server.
# Copyright © 2011-2015 Thaddee Tyl, Jan Keromnes. All rights reserved.
# Code covered by the LGPL license.

# The name of your main server file.
SERVER = app.js

# The folder where your precious website is.
WEB = web

# The folder where your minified, production-ready website should be published.
# Warning: `make` and `make clean` will delete this folder.
PUBLISH = publish

# The JS minifier. Change the priority order to your convenience.
# It must accept some JS in stdin, and produce the result on stdout.
# Note: you must create `google-closure.sh` yourself if you want it.
JSMIN = uglifyjs jsmin google-closure.sh js-minifier

# The suffix to use for minified files.
MIN = min

# To make your server secure, generate SSL certificates (e.g. `make https`),
# then start it with something like `SECURE=secure make start`.
ifdef SECURE
  PORT ?= 443
  SECURE = secure
else
  PORT ?= 80
  SECURE = insecure
endif
DEBUG ?= 0

# The output of console.log statements goes in this file when you `make`.
# Note: when you `make debug`, the output appears on the console.
LOG = node.log

# You can define custom rules and settings in such a file.
-include local.mk

# Default behavior for `make`.
all: publish stop start

# Publish your website.
publish: clean copy minify

# Try your unpublished website.
debug: stop startweb

# Delete generated files and logs.
clean:
	@echo "clean"
	@rm -rf $(LOG) $(PUBLISH)

# Simply copy all website files over to your publishing folder.
copy:
	@echo "copy"
	@cp -rf $(WEB) $(PUBLISH)

# Minify everything we can inside your publishing folder.
minify:
	@echo "minify"
	@for ajsmin in $(JSMIN); do  \
	  if which $$ajsmin > /dev/null; then chosenjsmin=$$ajsmin; break; fi;  \
	done;  \
	if which $$chosenjsmin > /dev/null ; then  \
	  for file in `find $(PUBLISH) -name '*\.js'`; do  \
	    $$chosenjsmin < "$${file}" > "$${file}$(MIN)";  \
	    mv "$${file}$(MIN)" "$${file}";  \
	  done;  \
	else  \
	  echo ' `sudo make jsmin` or install uglifyjs for minification.';  \
	fi

# Stop any previously-started Camp server.
stop:
	@echo "stop"
	@for pid in `ps aux | grep -v make | grep node | grep $(SERVER) | awk '{print $$2}'` ; do  \
	   kill -9 $$pid 2> /dev/null ;  \
	   if [ "$$?" -ne "0" ] ; then  \
	     sudo kill -9 $$pid 2> /dev/null ;  \
	   fi  \
	done;  \

# Start a Camp server with your published website (for production).
start:
	@echo "start"
	@if [ `id -u` -ne "0" -a $(PORT) -lt 1024 ] ;  \
	then  \
	  sudo node $(SERVER) $(PORT) $(SECURE) $(DEBUG) >> $(LOG) ;  \
	else  \
	  node $(SERVER) $(PORT) $(SECURE) $(DEBUG) >> $(LOG) ;  \
	fi

# Start a Camp server with your unpublished website (for development).
startweb:
	@echo "start web"
	@if [ `id -u` -ne "0" -a $(PORT) -lt 1024 ] ;  \
	then  \
	  sudo node $(SERVER) $(PORT) $(SECURE) $(DEBUG) >> $(LOG) ;  \
	else  \
	  node $(SERVER) $(PORT) $(SECURE) $(DEBUG) >> $(LOG) ;  \
	fi

# Run the ScoutCamp tests.
test:
	node test/test-api.js

# Update a ScoutCamp fork.
# Warning: overwrites this Makefile, you may want to create a local.mk!
update:
	@git clone https://github.com/espadrine/sc
	@cp sc/web/js/scout.js ./$(WEB)/js/scout.js
	@cp sc/lib/* ./lib/
	@cp sc/Makefile .
	@rm -rf sc/

# Install Doug Crockford's `jsmin` in `/usr/bin/jsmin`.
jsmin:
	@if [ `id -u` = "0" ] ;  \
	  then  wget "http://crockford.com/javascript/jsmin.c" && gcc -o /usr/bin/jsmin jsmin.c ;  \
	        rm -rf jsmin.c ;  \
	  else echo ' `sudo make jsmin`'; fi

# Generate self-signed HTTPS credentials.
https: https.crt

# Delete HTTPS credentials.
rmhttps:
	@echo "delete https credentials"
	@rm -rf https.key https.csr https.crt

# Generate an SSL certificate secret key. Never share this!
https.key:
	@openssl genrsa -out https.key 4096
	@chmod 400 https.key # read by owner

# Generate a CSR (Certificate Signing Request) for someone to sign your
# SSL certificate.
https.csr: https.key
	@openssl req -new -sha256 -key https.key -out https.csr
	@chmod 400 https.csr # read by owner

# Create a self-signed SSL certificate.
# Warning: web users will be shown a useless security warning.
https.crt: https.key https.csr
	@openssl x509 -req -days 365 -in https.csr -signkey https.key -out https.crt
	@chmod 444 https.crt # read by all

# Download Scout's JS dependencies into your website's js/ folder.
scout-update:
	@curl https://raw.github.com/jquery/sizzle/master/sizzle.js > $(WEB)/js/sizzle.js 2> /dev/null
	@curl https://raw.github.com/douglascrockford/JSON-js/master/json2.js > $(WEB)/js/json2.js 2> /dev/null
	@curl https://raw.github.com/remy/polyfills/master/EventSource.js > $(WEB)/js/EventSource.js 2> /dev/null

# Build the `scout.js` client script.
scout-build:
	@for ajsmin in $(JSMIN); do  \
	  if which $$ajsmin > /dev/null; then chosenjsmin=$$ajsmin; break; fi;  \
	done;  \
	cat $(WEB)/js/sizzle.js $(WEB)/js/json2.js $(WEB)/js/EventSource.js $(WEB)/js/additions.js | $$ajsmin > $(WEB)/js/scout.js
	@cp $(WEB)/js/scout.js .

# This is a self-documenting Makefile.
help:
	@cat Makefile | less

wtf: help

?: wtf

coffee:
	@echo "\n           )      (\n           (  )   )\n         _..,-(--,.._\n      .-;'-.,____,.-';\n     (( |            |\n      \`-;            ;\n         \\          /\n      .-''\`-.____.-'''-.\n     (     '------'     )\n      \`--..________..--'\n";

me a:
	@cd .

sandwich:
	@if [ `id -u` = "0" ] ; then echo "OKAY." ; else echo "What? Make it yourself." ; fi

.PHONY: all publish debug clean copy minify stop start startweb test update jsmin https scout-update scout-build help wtf ? coffee me a sandwich

