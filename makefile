# makefile: build and deploy from web/ to publish/, start/stop the server.
# Copyright (c) 2011 Jan Keromnes & Yann Tyl. All rights reserved.

LOG = node.log
SERVER = server.js
TARGET = publish
SOURCE = web
JSMIN = jsmin
MIN = min

build: clean deploy minify

clean:
	rm -rf $(TARGET)/* $(LOG)

deploy:
	cp -r $(SOURCE)/* $(TARGET)

minify:
	for file in `find $(TARGET) -name '*\.js'` ; do cat "$${file}" | $(JSMIN) > "$${file}$(MIN)" ; mv "$${file}$(MIN)" "$${file}" ; done

test:
	cd $(SOURCE) ; sudo node ../$(SERVER)

start:
	cd $(TARGET) ; sudo nohup node ../$(SERVER) > ../$(LOG) &

stop:
	for pid in `ps aux | grep node | grep $(SERVER) | awk '{print $$2}'` ; do sudo kill $$pid 2> /dev/null ; done

# time for a break
coffee:
	@echo "\n           )      (\n           (  )   )\n         _..,-(--,.._\n      .-;'-.,____,.-';\n     (( |            |\n      \`-;            ;\n         \\          /	\n      .-''\`-.____.-'''-.\n     (     '------'     )\n      \`--..________..--'\n";

# http://xkcd.com/149/
sandwich:
	@if [ `id -u` = "0" ] ; then echo "\nOKAY." ; else echo "\nWhat? Make it yourself." ; fi

