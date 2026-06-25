const CACHE_NAME='barbearia-ld-v1'
const ARQUIVOS=[
'./',
'./index.html',
'./cliente.html',
'./admin.html',
'./style.css',
'./app.js',
'./supabase.js',
'./manifest.json',
'./barbeariald.png',
'./favicon.ico',
'./android-chrome-192x192.png',
'./android-chrome-512x512.png'
]
self.addEventListener('install',e=>{
e.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(ARQUIVOS)))
self.skipWaiting()
})
self.addEventListener('activate',e=>{
e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))))
self.clients.claim()
})
self.addEventListener('fetch',e=>{
e.respondWith(caches.match(e.request).then(resp=>resp||fetch(e.request)))
})
