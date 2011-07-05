# Makefile: build and deploy from web/ to publish/, start/stop the server.
# Copyright (c) 2011 Jan Keromnes, Yann Tyl. All rights reserved.
# Code covered by the LGPL license.

LOG = node.log
SERVER = server.js
TARGET = publish
JSMIN = jsmin
MIN = min

WEB = web
DEMO = demo

web: clean deployweb minify start
demo: clean deploydemo minify start
test: web
	node test/main.js


# workflow

clean:
	rm -rf $(TARGET)/* $(LOG)

minify:
	for file in `find $(TARGET) -name '*\.js'` ; do cat "$${file}" | $(JSMIN) > "$${file}$(MIN)" ; mv "$${file}$(MIN)" "$${file}" ; done


start:
	cd $(TARGET) ; sudo nohup node ../$(SERVER) > ../$(LOG)

stop:
	for pid in `ps aux | grep node | grep $(SERVER) | awk '{print $$2}'` ; do sudo kill $$pid 2> /dev/null ; done


# deployment-specific items.

deployweb:
	cp -r $(WEB)/* $(TARGET)

deploydemo:
	cp -r $(DEMO)/* $(TARGET)


# time for a break
coffee:
	@echo "\n           )      (\n           (  )   )\n         _..,-(--,.._\n      .-;'-.,____,.-';\n     (( |            |\n      \`-;            ;\n         \\          /	\n      .-''\`-.____.-'''-.\n     (     '------'     )\n      \`--..________..--'\n";

# http://xkcd.com/149/
sandwich:
	@if [ `id -u` = "0" ] ; then echo "\nOKAY." ; else echo "\nWhat? Make it yourself." ; fi

