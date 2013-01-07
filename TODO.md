WHAT SHOULD WE DO?
==================

Make template systems modular.
Templates that conform to a certain API should be interoperable.

Make the logging system configurable. A single server should be able to log
warnings and errors in a configurable way. We can achieve that by allowing to
set a function that takes a string. By default, that function is console.error.

