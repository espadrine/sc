# makefile: build minified versions of scout.js and camp.js.
# Copyright (c) Thaddee Tyl 2011. All rights reserved.

FILES=scout.js camp.js

all: $(FILES)
	for file in $(FILES) ; do \
		fname=$$(echo $${file} | sed -e"s/\.js$$//"); \
		jsmin < "$${file}" > "$${fname}min.js"; \
	done
