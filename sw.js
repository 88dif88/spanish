/* ═══════════════════════════════════════════════
   Service Worker — офлайн кеш для Spanish Player
   Версія: 1.0
═══════════════════════════════════════════════ */

const CACHE_NAME = 'spanish-v1';
const TTS_CACHE  = 'spanish-tts-v1';

/* Файли додатку — кешуємо одразу */
const APP_FILES = [
  './',
  './index.html',
];

/* ── Встановлення ── */
self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return cache.addAll(APP_FILES);
    }).then(function(){
      return self.skipWaiting();
    })
  );
});

/* ── Активація ── */
self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(
        keys.filter(function(k){ return k !== CACHE_NAME && k !== TTS_CACHE; })
            .map(function(k){ return caches.delete(k); })
      );
    }).then(function(){ return self.clients.claim(); })
  );
});

/* ── Перехоплення запитів ── */
self.addEventListener('fetch', function(e){
  var url = e.request.url;
  
  /* TTS запити — кешуємо назавжди */
  if(url.includes('translate.googleapis.com/translate_tts')){
    e.respondWith(
      caches.open(TTS_CACHE).then(function(cache){
        return cache.match(e.request).then(function(cached){
          if(cached){
            return cached; /* з кешу */
          }
          /* Завантажуємо і зберігаємо */
          return fetch(e.request).then(function(response){
            if(response && response.status === 200){
              cache.put(e.request, response.clone());
            }
            return response;
          }).catch(function(){
            /* Офлайн і немає в кеші */
            return new Response('', {status: 503});
          });
        });
      })
    );
    return;
  }
  
  /* HTML/CSS/JS — спочатку кеш потім мережа */
  e.respondWith(
    caches.match(e.request).then(function(cached){
      return cached || fetch(e.request).then(function(response){
        if(response && response.status === 200){
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache){
            cache.put(e.request, clone);
          });
        }
        return response;
      });
    })
  );
});

/* ── Повідомлення від сторінки ── */
self.addEventListener('message', function(e){
  if(e.data && e.data.type === 'CACHE_TTS'){
    /* Попереднє кешування TTS */
    var urls = e.data.urls || [];
    caches.open(TTS_CACHE).then(function(cache){
      var done = 0;
      var total = urls.length;
      
      function next(i){
        if(i >= urls.length) return;
        cache.match(urls[i]).then(function(exists){
          if(exists){
            done++;
            e.source.postMessage({type:'CACHE_PROGRESS', done:done, total:total});
            next(i+1);
          } else {
            fetch(urls[i]).then(function(r){
              if(r && r.status===200) cache.put(urls[i], r);
              done++;
              e.source.postMessage({type:'CACHE_PROGRESS', done:done, total:total});
              /* Невелика затримка щоб не перевантажити */
              setTimeout(function(){ next(i+1); }, 150);
            }).catch(function(){
              done++;
              e.source.postMessage({type:'CACHE_PROGRESS', done:done, total:total});
              setTimeout(function(){ next(i+1); }, 150);
            });
          }
        });
      }
      
      /* Паралельно 3 потоки */
      next(0); next(Math.floor(total/3)); next(Math.floor(total*2/3));
    });
  }
  
  if(e.data && e.data.type === 'CACHE_STATUS'){
    caches.open(TTS_CACHE).then(function(cache){
      cache.keys().then(function(keys){
        e.source.postMessage({type:'CACHE_SIZE', count: keys.length});
      });
    });
  }
});
