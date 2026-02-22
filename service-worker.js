const CACHE_NAME = 'brew-panda-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  // Aggiungi qui altre risorse statiche che vuoi memorizzare nella cache, se necessario.
  // Es. '/styles/main.css', '/images/logo.png'
  // Le risorse da CDN verranno memorizzate nella cache dinamicamente.
];

// Installazione del service worker e caching delle risorse statiche
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Intercettazione delle richieste di rete
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Se la risorsa è nella cache, la restituisco
        if (response) {
          return response;
        }

        // Altrimenti, la richiedo alla rete
        return fetch(event.request).then(
          response => {
            // Se la risposta non è valida, la restituisco così com'è
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clono la risposta. Una va nella cache, l'altra al browser.
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
      })
  );
});

// Gestione dell'aggiornamento del service worker
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});