// public/sw.js
// Service Worker para PWA — habilita instalação e cache offline básico
//
// Estratégia: Cache First para assets estáticos, Network First para API

const CACHE_VERSION = 'v1'
const STATIC_CACHE = `foodsaas-static-${CACHE_VERSION}`
const RUNTIME_CACHE = `foodsaas-runtime-${CACHE_VERSION}`

const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

// Instalar: pré-cachear assets críticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

// Ativar: limpar caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

// Fetch: estratégia por rota
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Ignorar requisições não-GET e APIs
  if (event.request.method !== 'GET') return
  if (url.pathname.startsWith('/api/')) return
  if (url.pathname.startsWith('/_next/')) return

  // Cache First para assets estáticos
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/screenshots/') ||
    url.pathname === '/manifest.json'
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached ?? fetch(event.request))
    )
    return
  }

  // Network First para páginas
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() => caches.match(event.request))
  )
})
