# Makefile: Publish your website and start/stop your server.
# Copyright (c) 2011 Jan Keromnes, Yann Tyl. All rights reserved.
# Code covered by the LGPL license.

LOG = node.log
SERVER = server.js
TARGET = publish
JSMIN = jsmin
MIN = min
WEB = web

web: clean deploy minify start

clean:
	rm -rf $(TARGET)/* $(LOG)

deploy:
	cp -r $(WEB)/* $(TARGET)
  
minify:
	for file in `find $(TARGET) -name '*\.js'` ; do cat "$${file}" | $(JSMIN) > "$${file}$(MIN)" ; mv "$${file}$(MIN)" "$${file}" ; done

start:
	cd $(TARGET) ; sudo node ../$(SERVER) > $(LOG).log

stop:
	for pid in `ps aux | grep node | grep $(SERVER) | awk '{print $$2}'` ; do sudo kill -9 $$pid 2> /dev/null ; done

coffee:
	@echo "\n           )      (\n           (  )   )\n         _..,-(--,.._\n      .-;'-.,____,.-';\n     (( |            |\n      \`-;            ;\n         \\          /	\n      .-''\`-.____.-'''-.\n     (     '------'     )\n      \`--..________..--'\n";

sandwich:
	@if [ `id -u` = "0" ] ; then echo "\nOKAY." ; else echo "\nWhat? Make it yourself." ; fi

