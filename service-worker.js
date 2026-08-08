const CACHE_NAME = 'taskview-v1';
const ASSETS = [
  './',
  'index.html',
  'login.html',
  'register.html',
  'profile.html',
  'settings.html',
  'finddata.html',
  'style.css',
  'auth.css',
  'profile.css',
  'settings.css',
  'script.js',
  'auth.js',
  'firebase.js',
  'firestore-sync.js',
  'profile.js',
  'settings.js',
  'manifest.json',
  'icon-192.png',
  'icon-512.png'
];

// Install Event — Cache Assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching files...');
      return cache.addAll(ASSETS);
    })
  );
});

// Activate Event — Clean Up Old Caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Clearing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event — Network First, Fallback to Cache
self.addEventListener('fetch', (e) => {
  // Only handle GET requests and local requests
  if (e.request.method !== 'GET') return;
  
  const url = new URL(e.request.url);
  // Ignore Firebase API calls, Firestore calls, and third-party scripts (Google Fonts, jQuery CDN)
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // If valid response, clone and save in cache
        if (response && response.status === 200) {
          const responseCopy = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseCopy);
          });
        }
        return response;
      })
      .catch(() => {
        // If network fails, serve from cache
        return caches.match(e.request);
      })
  );
});

// Listen for messages from client page to trigger update immediately
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});
