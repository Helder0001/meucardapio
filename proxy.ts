import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { apiLimiter } from '@/lib/security/rate-limit'
import { buildCSP } from '@/lib/security/csp'

const RESTRICTED_ROLES = ['STAFF', 'DELIVERY_PERSON']

const ALLOWED_EXACT = ['/dashboard']

const ALLOWED_PREFIXES = ['/dashboard/orders', '/dashboard/delivery/tracking']

// crypto.timingSafeEqual (Node.js) não existe no Edge Runtime, onde este
// middleware sempre roda — implementação manual constant-time (XOR
// acumulado), funciona igual em qualquer ambiente JS.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Nonce por requisição — usado no CSP (script-src) pra permitir só os
  // scripts inline que a própria aplicação gerou (ex.: next-themes evitando
  // flash de tema), em vez de 'unsafe-inline' liberando QUALQUER inline.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)

  const response = NextResponse.next({ request: { headers: requestHeaders } })

  // =========================
  // Limite de payload
  // =========================
  if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
    const contentLength = request.headers.get('content-length')

    if (contentLength) {
      const bytes = parseInt(contentLength, 10)

      const MAX_BYTES = pathname.startsWith('/api/upload')
        ? 6_000_000
        : 1_000_000

      if (bytes > MAX_BYTES) {
        return NextResponse.json(
          { error: 'Payload muito grande' },
          { status: 413 }
        )
      }
    }
  }

  // =========================
  // Rate limit geral da API
  // =========================
  const isRateLimitedApi =
    pathname.startsWith('/api/') &&
    !pathname.startsWith('/api/webhooks/') &&
    !pathname.startsWith('/api/internal/') &&
    !pathname.startsWith('/api/printers/')

  if (isRateLimitedApi) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
    const { success } = await apiLimiter.limit(ip)
    if (!success) {
      return NextResponse.json(
        { error: 'Muitas requisições. Aguarde um momento.' },
        { status: 429 }
      )
    }
  }

  // =========================
  // Path Traversal
  // =========================
  if (pathname.includes('..') || pathname.includes('%2e%2e')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const isDev = process.env.NODE_ENV === 'development'

  const isStorefront = pathname.startsWith('/menu/')

  const isDashboard = pathname.startsWith('/dashboard') || pathname.startsWith('/master')

  // =========================
  // Security Headers
  // =========================
  if (isDashboard) {
    response.headers.set('X-Frame-Options', 'DENY')
  } else if (isStorefront) {
    response.headers.set('X-Frame-Options', 'SAMEORIGIN')
  } else {
    response.headers.set('X-Frame-Options', 'DENY')
  }

  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-DNS-Prefetch-Control', 'on')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(self), payment=()'
  )
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload'
  )
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none')

  // CSP construída pelo módulo dedicado
  if (!isDev) {
    const csp = buildCSP({ nonce, isStorefront, isDev })
    response.headers.set('Content-Security-Policy', csp)
  }

  // =========================
  // Autenticação
  // =========================
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
    secureCookie: process.env.NODE_ENV === 'production',
  })

  if (process.env.NODE_ENV === 'development') {
    console.log('[proxy]', pathname, token?.role ?? 'anonymous')
  }

  const isAuthPage = ['/login', '/register', '/verify-otp', '/forgot-password'].some((p) =>
    pathname.startsWith(p)
  )

  if (isDashboard && !token) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // =========================
  // MASTER ADMIN
  // =========================
  if (pathname.startsWith('/master') && token?.role !== 'MASTER_ADMIN') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // =========================
  // Restrição STAFF/DELIVERY
  // =========================
  if (
    pathname.startsWith('/dashboard') &&
    token?.role &&
    RESTRICTED_ROLES.includes(token.role as string)
  ) {
    const allowed =
      ALLOWED_EXACT.includes(pathname) ||
      ALLOWED_PREFIXES.some((p) => pathname.startsWith(p))

    if (!allowed) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard/orders/kanban'
      url.search = ''
      return NextResponse.redirect(url)
    }
  }

  // =========================
  // Usuário logado tentando acessar login/register
  // =========================
  if (isAuthPage && token) {
    const destination = token.role === 'MASTER_ADMIN' ? '/master/dashboard' : '/dashboard'
    return NextResponse.redirect(new URL(destination, request.url))
  }

  // =========================
  // APIs internas (cron)
  // =========================
  if (pathname.startsWith('/api/internal/')) {
    const cronSecret = request.headers.get('x-cron-secret')
    const expected = process.env.CRON_SECRET

    const isValid = !!expected && !!cronSecret && timingSafeEqual(expected, cronSecret)

    if (!isValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // =========================
  // APIs protegidas
  // =========================
  const publicOrderRoutes = [
    /^\/api\/orders\/[^/]+\/status$/,
    /^\/api\/orders\/[^/]+\/pay-card$/,
    /^\/api\/orders\/[^/]+\/regenerate-pix$/,
  ]
  const isPublicOrderRoute = publicOrderRoutes.some((re) => re.test(pathname))

  const protectedApiRoutes = ['/api/orders', '/api/upload', '/api/whatsapp', '/api/ai']

  if (
    !isPublicOrderRoute &&
    protectedApiRoutes.some((route) => pathname.startsWith(route)) &&
    !token
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons/|screenshots/).*)',
  ],
}
