const CACHE_NAME='barbearia-ld-v10'
self.addEventListener('install',e=>{
self.skipWaiting()
})
self.addEventListener('activate',e=>{
e.waitUntil(
caches.keys().then(keys=>Promise.all(keys.map(k=>caches.delete(k)))).then(()=>self.clients.claim())
)
})
self.addEventListener('fetch',e=>{
e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)))
})
