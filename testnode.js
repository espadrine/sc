var http = require('http'),
	fs = require('fs'),
	url = require('url');
	
	
	
var server = http.createServer(function(req,res){
	var path = url.parse(req.url).pathname;
	
	try {
		if (path == '/') {
			path = '/index.html';
		}
		var src = fs.readFileSync(path).toString();
		var template = normal.compile(src);
				
		res.writeHead(200, {'Content-Type': 'text/html'});
		res.write(template(data));
		res.end();
		
		
	}
	catch(e) {
		res.writeHead(404);
		res.write('404');
		res.end();
	}
