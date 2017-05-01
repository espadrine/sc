SCOUT CAMP
==========


Dealing with server systems can be alleviated by systems which allow clear
distinction between:

  * serving pages; and
  * powering applications.


Camp.js
-------

We start the web server.

```js
var camp = require('camp').start();
```

The `start()` function has the following properties:

- `documentRoot`: the path to the directory containing the static files you
  serve (and the template files, potentially). If your website is made of HTML
  pages, this is where they are located. Defaults to `./web`.
- `templateReader`: the default template engine used. See below.
- `passphrase`, `key`, `cert`, `ca`: in the case of a secure website (using
  HTTPS), those are fields you may specify to indicate where to find information
  about the website's security. Defaults include "https.key", "https.crt", and,
  as the CA (Certificate Authority, a list of certificates) an empty list.
- `setuid`: once the server has made the connection, set the user id to
  something else. This is particularly useful if you don't want the server to
  run as the almighty root user. However, executing this requires to be root (so
  you will need to use `sudo` or the like to run the server).
- `saveRequestChunks`: some requests will have their data processed by Camp
  before reaching your handlers, in order to fill the Augmented Request's
  `req.data` dictionary, but this means that you won't receive any of the
  processed chunks by doing `req.on('data',function(chunk){})` in your handler.
  If you need to access these raw chunks (e.g. to pipe complete requests to a
  different server), you'll find them in `req.chunks` when `saveRequestChunks`
  is set to `true`.

The result of `require('camp')` can also be useful, for instance, to log
warnings from the server. The logging system uses
[multilog](https://www.npmjs.org/package/multilog).

```js
var Camp = require('camp');
Camp.log.unpipe('warn', 'stderr');
// There are three streams: warn, error, and all.
// warn and error are individually piped to stderr by default.
```

### Ajax

The Camp.js engine targets ease of use of both serving plain html files and ajax
calls. By default, when given a request, it looks for files in the `./web/`
directory. However, it also has the concept of Ajax actions.

```js
camp.ajax.on('getinfo', function(json, end, ask) {
  console.log(json);
  end(json);   // Send that back to the client.
});
```

An action maps a string to the path request `/$<string>`.  When a client asks
for this resource, sending in information stored in the "json" parameter,
Camp.js will send it back the object literal that the callback function gives.

In the example given, it merely sends back whatever information the client
gives, which is a very contrived example.

The purpose of this distinction between normally served html pages and ajax
actions is to treat servers more like applications. You first serve the
graphical interface, in html and css, and then, you let the user interact with
the server's data seemlessly through ajax calls.

Note that  the `json` parameter given is a single object containing all
parameters from the following sources:

- the query string from GET requests
- POST requests with enctype application/x-www-form-urlencoded
- POST requests with enctype multipart/form-data. This one uses the same API as
  [formidable](https://github.com/felixge/node-formidable) for file objects.

You also get an [Ask](#the-ask-class) object, see below.

Before downloading POST Ajax data, you can hook a function up using the
following code:

```js
camp.ajaxReq.on('getinfo', function(ask) { … });
```

That can be useful to give information about the progress of an upload, for
instance, using `ask.form.on('progress', function(bytesReceived, bytesExpected) {})`.

### EventSource

Let's build a path named `/path`. When we receive a call on `/talk`, we send
the data it gives us to the EventSource path.

```js
// This is actually a full-fledged chat.
var chat = camp.eventSource ( '/all' );
camp.post('/talk', function(req, res) { chat.send(req.data); res.end(); });
```

This EventSource object we get has two methods:

- The `send` method takes a JSON object and emits the `message` event to the
  client. It is meant to be used with `es.onrecv`.
- The `emit` method takes an event name and a textual message and emits this
  event with that message to the client. It is meant to be used with
  `es.on(event, callback)`.

### WebSocket

We also include the raw duplex communication system provided by the WebSocket
protocol.

```js
camp.ws('/path', function(socket));
```

Every time a WebSocket connection is initiated (say, by a Web browser), the
function is run. The `socket` is an instance of [ws.WebSocket]
(https://github.com/einaros/ws/blob/master/doc/ws.md#class-wswebsocket).
Usually, you only need to know about `socket.on('message', function(data))`,
and `socket.send(data)`.

This function returns an instance of a [WebSocket server]
(https://github.com/einaros/ws/blob/master/doc/ws.md#class-wsserver)
for that path.
Most notably, it has a `wsServer.clients` list of opened sockets on a path.

A map from paths to WebSocket servers is available at:

```js
camp.wsChannels[path];
```

For the purpose of broadcasting (ie, sending messages to every connected socket
on the path), we provide the following function.

```js
camp.wsBroadcast('/path', function recv(req, res))
```

The `recv` function is run once every time a client sends data.

- Its `req` parameter provides `req.data` (the data that a client sent), and
  `req.flags` (`req.flags.binary` is true if binary data is received;
  `req.flags.masked` if the data was masked).
- Its `res` parameter provides `res.send(data)`, which sends the same data to each socket on the path.

Client-side, obviously, your browser needs to have a
[WebSocket API](http://caniuse.com/#feat=websockets).
The client-side code may look like this.

```js
// `socket` is a genuine WebSocket instance.
var socket = new WebSocket('/path');
socket.send(JSON.stringify({ some: "data" }));
```

### Socket.io

Be warned before you read on: the Socket.io interface is deprecated.
Use the WebSocket interface provided above instead.
Also, do not use *both* the socket.io interface and the WebSocket interface.
That seems to be asking for trouble.

We also include the duplex communication system that socket.io provides. When
you start the server, by default, socket.io is already launched. You can use its
APIs as documented at <http://socket.io#how-to-use> from the `camp.io` object.

```js
camp.io.sockets.on('connection', function (socket) { … });
```

On the client-side, `Scout.js` also provides shortcuts, through its
`Scout.socket(namespace)` function. Calling `Scout.socket()` returns the
documented Socket.io object that you can use according to their API.

```js
var io = Scout.socket();
io.emit('event name', {data: 'to send'});
io.on('event name', function (jsonObject) { … });
```

### Handlers

If you want a bit of code to be executed on every request, or if you want to
manually manage requests at a low level without all that fluff described above,
you can add handlers to the server.

Each request goes through each handler you provided in the order you provided
them. Unless a handler calls `next()`, the request gets caught by that handler:

1. None of the handlers after that one get called,
2. None of the subsequent layers of Camp (such as WebSocket, EventSource,
   Route…) get called.

Otherwise, all the handlers get called, and the request will get caught by one
of the subsequent layers of Camp.

```js
var addOSSHeader = function(req, res, next) {
  ask.res.setHeader('X-Open-Source', 'https://github.com/espadrine/sc/');
  next();
};
camp.handle(addOSSHeader);
// There's no reason to remove that amazing handler, but if that was what
// floated your boat, here is how you would do that:
camp.removeHandler(addOSSHeader);
```


Templates
---------

An associated possibility, very much linked to the normal use of Camp.js, is to
handle templates. Those are server-side preprocessed files.

### Basic Usage

Mostly, you first decide where to put your template file. Let's say we have
such a file at `/first/post.html` (from the root of the web/ or publish/
directory).

```js
var posts = ['This is the f1rst p0st!'];

camp.path( 'first/post.html', function(req, res) {
  res.template({
    text: posts[0],
    comments: ['first comment!', 'second comment…']
  });
});
```

`req` is an Augmented Request, and `res` an Augmented Response.
Therefore, if the request is `/first/post.html?key=value`, then `req.data.key`
will be "value".

`res.template(scope, templates)` responds to the request with a list of
templates (produced with `Camp.template()` or `camp.template()`), a single
template, or no template:
in the latter case, the URI's path will be treated as a template file on disk
under `documentRoot`. This is the case here with "first/post.html".

The file `/web/first/post.html` might look like this:

```html
<!doctype html><title></title>
<p>{{= text in html}}</p>
<ul>
{{for comment in comments {{
  <li>{{= comment in html}}</li>
}}}}
</ul>
```

Because it will be preprocessed server-side, the browser will actually receive
the following file:

```html
<!doctype html><title></title>
<p>This is the f1rst p0st!</p>
<ul>
  <li>first comment!</li>
  <li>second comment...</li>
</ul>
```

If you need to specify a different template, you can do so:

```js
var postsTemplate = Camp.template( './templates/posts.html' );
camp.path('posts', function(req, res) {
  res.template({comments: comments}, postsTemplate);
});
```

`Camp.template(paths, options)` takes an Array of String paths to templating
files (or a single path to a templating file), and the following options:
- reader: the template reader function in use, defaulting to
  `camp.templateReader`, which defaults to
  [Fleau](https://github.com/espadrine/fleau).
- asString: boolean; use the string as a template, not as a file path.
- callback: function taking a function(scope) → readableStream.
  If you don't want the template creation to be synchronous, use this.
  We return nothing from the function if `callback` is set.

This function returns a function(scope) → readableStream, unless `callback` is
set.

So this is how to be explicit about the template. On the opposite extreme, you
can be extra implicit: the URL path will them be used as the template path on
disk, and `req.data` will be used as the template's scope.

```js
// Supports ?mobile=true
camp.path('blog.html');
```


## Fall through

```js
camp.notFound( 'blog/*', function(req, res) {
  res.file('/templates/404.html');
});
```

The `camp.notFound()` function works in exactly the same way as the
`camp.path()` function, with two important differences:

1. It only gets used when nothing else matches the path, including paths and
   static files on disk under `documentRoot`,
2. It responds with a 404 (Not Found) status code.



Camp In Depth
-------------

In Camp.js, there is a lot more than meets the eye. Up until now, we have only
discussed the default behaviour of ScoutCamp. For most uses, this is actually
more than enough. Sometimes, however, you need to dig a little deeper.

### The Camp Object

`Camp.start` is the simple way to launch the server in a single line. You may
not know, however, that it returns an `http.Server` (or an `https.Server`)
subclass instance. As a result, you can use all node.js' HTTP and HTTPS
methods.

You may provide the `start` function with a JSON object defining the server's
settings. It defaults to this:

```js
{
  port: 80,       // The port to listen to.
  hostname: '::', // The hostname to use as a server
  security: {
    secure: true,
    key: 'https.key',  // Either the name of a file on disk,
    cert: 'https.crt', // or the content as a String.
    ca: ['https.ca']
  }
}
```

If you provide the relevant HTTPS files and set the `secure` option to true, the
server will be secure.

`Camp.createServer()` creates a Camp instance directly, and
`Camp.createSecureServer(settings)` creates an HTTPS Camp instance. The latter
takes the same parameters as `https.Server`.

`Camp.Camp` and `Camp.SecureCamp` are the class constructors.


### The stack

Camp is stack-based. When we receive a request, it goes through all the layers
of the stack until it hits the bottom. It should never hit the bottom: each
layer can either pass it on to the next, or end the request (by sending a
response).

The default stack is defined this way:

```js
campInstance.stack = [wsLayer, ajaxLayer, eventSourceLayer, pathLayer
                      routeLayer, staticLayer, notfoundLayer];
```

Each element of the stack `function(req, res, next){}` takes two parameters:

- augmented [IncomingMessage][] (`req`) and [ServerResponse][] (`res`)
  (more on that below),
- a `next` function, which the layer may call if it will not send an HTTP
  response itself. The layer that does catch the request and responds fully to
  it will not call `next()`, the others will call `next()`.

[IncomingMessage]: https://nodejs.org/api/http.html#http_class_http_incomingmessage
[ServerResponse]: https://nodejs.org/api/http.html#http_class_http_serverresponse

You can add layers to the stack with `handle()`, which is described way above.

```js
camp.handle(function(ask, next) {
  ask.res.setHeader('X-Open-Source', 'https://github.com/espadrine/sc/');
  next();
});
```

By default, it inserts it before the `wsLayer`, but after other inserted
handlers. Its insertion point is at `camp.stackInsertion` (an integer).

### Ask and Augmented Request

The **Ask class** is a way to provide a lot of useful elements associated with
a request. It contains the following fields:

- server: the Camp instance,
- req: the [http.IncomingMessage](http://nodejs.org/api/http.html#http_http_incomingmessage) object.
- res: the [http.ServerResponse](http://nodejs.org/api/http.html#http_class_http_serverresponse) object.
- uri: the URI.
- path: the pathname associated with the request.
- query: the query taken from the URI.
- cookies: using the [cookies](https://github.com/pillarjs/cookies) library.
- form: a `formidable.IncomingForm` object as specified by
  the [formidable](https://github.com/felixge/node-formidable)
  library API. Noteworthy are `form.uploadDir` (where the files are uploaded,
  this property is settable),
  `form.path` (where the uploaded file resides),
  and `form.on('progress', function(bytesReceived, bytesExpected) {})`.
- username, password: in the case of a Basic Authentication HTTP request, parses
  the contents of the request and places the username and password as strings in
  those fields.

An `Ask` instance is provided as an extra parameter to
`camp.route(pattern, function(query, path, end, ask))`
(see the start of section "Diving In"),
and as a parameter in each function of the server's stack
`function(ask, next)`
(see the start of section "The stack").

An **Augmented Request** is an [IncomingMessage][] which has several additional
fields which you can also find in `Ask`: `server`, `uri`, `form`, `path`,
`data` (which is the same as `query`), `username`, `password`, `cookies`.

It also contains form information for `multipart/form-data` requests in the
following fields:
- form: a `formidable.IncomingForm` object as specified by
  the [formidable](https://github.com/felixge/node-formidable)
  library API. Noteworthy are `form.uploadDir` (where the files are uploaded)
  and `form.on('progress', function(bytesReceived, bytesExpected) {})`.
- fields: a map from the field name (eg, `fieldname` for
  `<input name=fieldname>`) to the corresponding form values.
- files: a map from the field name (eg, `fieldname` for
  `<input name=content type=file>`) to a list of files, each with properties:
  - path: the location on disk where the the file resides
  - name: the name of the file, as asserted by the uploader.

An **Augmented Response** is a [ServerResponse][] which also has:

- `template(scope, templates)`: responds to the request with a list of templates
  (produced with `Camp.template()` or `camp.template()`), a single template, or
  no template (in which case, the URI's path will be treated as a template file
  on disk under `documentRoot`). The `scope` is a JS object used to fill in the
  template.
- `file(path)`: responds to the request with the contents of the file at `path`,
  on disk under `documentRoot`.
- `json(data, replacer, space)`: responds to the request with stringified JSON
  data. Arguments are passed to `JSON.stringify()`, so you can use either
  `res.json({a: 42})` (minified) or `res.json({a: 42}, null, 2)`
  (human-readable).
- `compressed()`: returns a writable stream. All data sent to that stream gets
  compressed and sent as a response.
- `redirect(path)`: responds to the request with a 303 redirection to a path
  or URL.

Note: `file(path)` leverages browser caching by comparing `If-Modified-Since`
request headers against actual file timestamps, and saves time and bandwidth by
replying "304 Not Modified" with no content to requests where the browser
already knows the latest version of a file. However, this header is limited to
second-level precision by specification, so any file changes happening within
the same second, or within a 2-second window in the case of leap seconds, cause
a small risk of browsers fetching and caching a stale version of the file in
between these changes. Such a cached version would remain stale until the next
file change and subsequent browser request updating the cache.

Additionally, you can set the mime type of the response with
`req.mime('png')`, for instance.

### Default layers

The default layers provided are generated from what we call units, which are
exported as shown below. Each unit is a function that takes a server instance
and returns a layer (`function(ask, next){}`).

- `Camp.ajaxUnit` (seen previously)
- `Camp.socketUnit` (idem)
- `Camp.wsUnit` (idem)
- `Camp.eventSourceUnit` (idem)
- `Camp.pathUnit` (idem)
- `Camp.routeUnit` (idem)
- `Camp.staticUnit` (idem, relies on `camp.documentRoot` which specifies the
  location of the root of  your static web files. The default is "./web".
- `Camp.notfoundUnit` (idem)

Scout.js
--------

### XHR

Browsers' built-in Ajax libraries are usually poor. They are not cross-browser
(because of Internet Explorer) and they can quickly become a hassle. Scout.js
is a javascript library to remove that hassle.

With Scout.js, one can easily target a specific element in the page which
must trigger an XHR(XML Http Request) when a specific event is fired. This is
what you do, most of the time, anyway. Otherwise, it is also easy to attach an
XHR upon a "setTimeout", and so on.

```js
Scout ( '#id-of-element' ).on ( 'click', function (params, evt, xhr) {
  params.action = 'getinfo';
  var sent = this.parentNode.textContent;
  params.data = { ready: true, data: sent };
  params.resp = function ( resp, xhr ) {
    if (resp.data === sent) {
      console.log ('Got exactly what we sent.');
    }
  };
});

// or...

setTimeout ( Scout.send ( function ( params, xhr ) { … } ), 1000 );
```

One thing that can bite is the fact that each Scout object only has one XHR
object inside. If you do two Ajax roundtrips at the same time, with the same
Scout object, one will cancel the other.

This behavior is very easy to spot. On the Web Inspector of your navigator, in
the "Network" tab, if a `$action` POST request is red (or cancelled), it means
that it was killed by another XHR call.

The cure is to create another Scout object through the
`var newScout = Scout.maker()` call.

### Server-Sent Events

All modern browsers support a mechanism for receiving a continuous,
event-driven flow of information from the server. This technology is called
*Server-Sent Events*.

The bad news about it is that it is a hassle to set up server-side. The good
news is that you are using ScoutCamp, which makes it a breeze. Additionally,
ScoutCamp makes it work even in IE7.

```js
var es = Scout.eventSource('/path');

es.on('eventName', function (data) {
  // `data` is a string.
});

es.onrecv(function (json) {
  // `json` is a JSON object.
});
```
- - -

Thaddee Tyl, author of ScoutCamp.
