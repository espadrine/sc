/* client.js: manages the client-side of the collaborative editor
 * Copyright (c) 2011 Jan Keromnes. All rights reserved.
 * */

(function (){
  
  
  
  var editor = new CodeMirror(document.body, {
      content: window.client.copy,
      height: "50%",
      width: "100%",
      parserfile: ["parsexml.js", "parsecss.js", "tokenizejavascript.js", "parsejavascript.js", "parsehtmlmixed.js"],
      stylesheet: ["css/xmlcolors.css", "css/jscolors.css", "css/csscolors.css"],
      path: "js/"
    });
	
	
    setInterval(Scout.send(function(xhr, params){
      params.data = {
	    usr: window.client.usr,
        rev: window.client.rev,
        delta: window.client.delta
      };
      params.open.url = '';
      params.resp = function(xhr, resp) {
        alert(JSON.stringify(resp));
      };
    }), window.client.timeout);
  
  
})()
