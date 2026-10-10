const CACHE = 'nfc-hub-public-v2';
const base = new URL('./', self.location);
const APP_SHELL = ['p/', 'p/index.html', 'css/public.css', 'js/public.js', 'js/config.js', 'manifest.webmanifest', 'assets/pwa-icon.svg']
  .map((path) => new URL(path, base).pathname);
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL))));
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
