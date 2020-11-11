# Changelog

## 18.1.0

- Add add `staticMaxAge` param for setting `Cache-Control` header on static files.

## 18.0.0

- Add top-level `.create()` method which has the same signature as `.start()`
  but does not start the server. Invoke `.startAsConfigured()` to use the
  configured host and port name.
