// public/sw.js
// Service Worker para PWA — habilita instalação e cache offline básico
//
// Estratégia: Cache First para assets estáticos, Network First para API
//
// FIX (16/07): bug que quebrava banner/logo do cardápio e corrompia o
// Content-Type de chunks JS/CSS do Next.js. Duas causas:
// 1. Nenhuma trava pra requisições de esquema não-http(s) — extensões do
//    navegador (ex.: Google Tradutor) podem disparar fetches com esquema
//    "chrome-extension:" que passam pelo listener de fetch da página;
//    tentar colocar isso no Cache Storage lança
//    "Failed to execute 'put' on 'Cache': Request scheme ... is unsupported".
// 2. Essa falha de cache.put() não tinha .catch() — em navegadores/condições
//    onde o encadeamento da promise acaba ficando dependente dela, a
//    rejeição derrubava a RESPOSTA REAL que devia ir pra tela (por isso a
//    imagem quebrava: o fetch em si tinha funcionado, só o cache que falhou).
// Bump de CACHE_VERSION pra v2 pra descartar qualquer entrada já cacheada
// incorretamente (ex.: o chunk .css que veio com Content-Type errado).

const CACHE_VERSION = 'v2'
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

// Tenta guardar no cache sem NUNCA deixar uma falha aqui afetar a resposta
// real devolvida pra página — cache é só um bônus (offline/velocidade),
// não pode ser motivo de quebrar o conteúdo na tela.
function safeCachePut(cacheName, request, response) {
  caches.open(cacheName)
    .then((cache) => cache.put(request, response))
    .catch((err) => {
      // Comum e inofensivo: respostas opacas (cross-origin sem CORS),
      // esquemas não suportados (chrome-extension:, etc.), ou requests
      // que o Cache Storage rejeita por outros motivos. Só logamos, nunca
      // deixamos isso virar unhandled rejection nem afetar o fetch.
      console.warn('[sw] cache.put ignorado:', err?.message || err)
    })
}

// Fetch: estratégia por rota
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Só lidamos com esquemas http(s) — chrome-extension:, moz-extension:,
  // data:, blob: etc. não são suportados pelo Cache Storage e nem faz
  // sentido a gente interceptar. Deixa o navegador tratar nativamente.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return

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

  // Network First para páginas e imagens (inclusive cross-origin, ex.:
  // Supabase Storage) — a resposta da rede sempre é devolvida pra página
  // independente do resultado do cache.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Só tenta cachear respostas "normais" (basic/cors com status ok).
        // Respostas opacas (no-cors cross-origin) ou de erro não valem a
        // pena cachear e já causaram os bugs acima.
        if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
          safeCachePut(RUNTIME_CACHE, event.request, response.clone())
        }
        return response
      })
      .catch(() => caches.match(event.request))
  )
})
