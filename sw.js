/* Service worker: aplikacija radi i bez interneta. */
var VERSION = 'racuni-v3';
var SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'parser.js', 'scan.js', 'manifest.json', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION && k !== 'racuni-ocr'; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // Velike datoteke za čitanje računa (Tesseract + hrvatski jezik): spremi nakon prvog preuzimanja
  if (url.origin === self.location.origin && url.pathname.indexOf('/vendor/') !== -1) {
    e.respondWith(caches.open('racuni-ocr').then(function (c) {
      return c.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) {
          if (res.ok) c.put(req, res.clone());
          return res;
        });
      });
    }));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Vlastite datoteke: prvo mreža (da dobijemo nove verzije), pa spremljena kopija
  e.respondWith(fetch(req).then(function (res) {
    if (res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(req).then(function (hit) { return hit || caches.match('index.html'); });
  }));
});
