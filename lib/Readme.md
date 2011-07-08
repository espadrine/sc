SCOUT CAMP
==========


Dealing with server systems can be alleviated by systems which allow clear
distinction between:

  * serving pages; and
  * powering applications.


Node.js
-------

The technology that Scout Camp is built on top of is Node.js, a modest library
for creating server applications.

Node.js is a high-performance library implementing a series of protocols
including HTTP 1.1, TCP, and so much more. It is designed to be event-based and
non-blocking, a combination which has already proven to be awesome in web
browsers. However, using events has typically been awkward in C and similar
non-closure languages. As a result, Node.js uses a javascript interface built
with V8, with which one can script anything and have access to all Node.js'
functionnality.

The reason why the combination non-blocking IO + events + closures is
particularly witful is the following. In order to perform non-blocking IO, one
does need some kind of parallelism. Threads, or even processes, can be used for
that, but they are technically challenging to use, even for alert mutex
experts. CSP is another option, but it is not present by default in programming
languages, and it is hard to "install". On the other hand, events are very easy
to use, they are already present in the browser and scriptable from javascript.
However, events require that one give a chunk of code, a function of some sort,
to handle some event. Passing functions as a parameter is typically cumbersome
in C, etc. You have to declare it in global space, define it there, even though
you may not have access to all the variables you need, and you therefore enter a
hell of billion-parameters functions. Closures, on the other hand, adresses this
concern beautifully. All variables in scope are accessible, and you may pass in
anonymous functions without needing to worry.


Scout.js
--------

Today's built-in Ajax library is poor. It is not cross-browser (because of
Internet Explorer) and it can quickly become a hassle. Scout.js is a javascript
library that removes that hassle.

With Scout.js, one can easily target a specific element in the page which
must trigger an XHR(XML Http Request) when a specific event is fired. This is
what you do, most of the time, anyway. Otherwise, it is also easy to attach an
XHR upon a "setTimeout", and so on.

    Scout ( '#id-of-element' ).on ( 'click', function (xhr, evt, params) {
      params.open.url = '/$getinfo';
      var sent = this.parentNode.textContent;
      params.data = { ready: true, data: sent };
      params.resp = function ( xhr, resp ) {
        if (resp.data === sent) {
          console.log ('Got exactly what we sent.');
        }
      };
    });


Camp.js
-------

The Camp.js engine targets ease of use of both serving plain html files and ajax
calls. By default, when given a request, it looks for files in the current
directory. However, it also has the concept of actions.

    var camp = require ( './camp.js' );
    camp.add ( 'getinfo', function (json) { console.log (json); return json; } );
    camp.Server.start ();

An action maps a string to the path request "/$<string>". When a client asks for
this resource, sending in information stored in the "json" parameter, Camp.js
will send it back the object literal that the callback function gives.

In the example given, it merely sends back whatever information the client
gives, which is not very relevant.

The purpose of this distinction between normally served html pages and ajax
actions is to treat servers more like applications. You first serve the
graphical interface, in html and css, and then, you let the user interact with
the server's data seemlessly through ajax calls.


Thaddee Tyl, author of Scout Camp.
