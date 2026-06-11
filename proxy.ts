// proxy.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  // Limite de payload
  if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
    const contentLength = request.headers.get('content-length');
    if (contentLength) {
      const bytes = parseInt(contentLength, 10);
      const MAX_BYTES = pathname.startsWith('/api/upload') ? 6_000_000 : 1_000_000;
      if (bytes > MAX_BYTES) {
        return NextResponse.json({ error: 'Payload muito grande' }, { status: 413 });
      }
    }
  }

  // Path traversal
  if (pathname.includes('..') || pathname.includes('%2e%2e')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const isDev = process.env.NODE_ENV === 'development';
  const isStorefront = pathname.startsWith('/menu/');
  const isDashboard = pathname.startsWith('/dashboard') || pathname.startsWith('/master');

  // Headers de segurança
  if (isDashboard) response.headers.set('X-Frame-Options', 'DENY');
  else if (isStorefront) response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  else response.headers.set('X-Frame-Options', 'DENY');

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-DNS-Prefetch-Control', 'on');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=()');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');

  if (!isDev) {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://sdk.mercadopago.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data: https:",
      "font-src 'self'",
      "connect-src 'self' https://api.mercadopago.com https://*.upstash.io wss://",
      "frame-src https://www.mercadopago.com",
      `frame-ancestors ${isStorefront ? "'self'" : "'none'"}`,
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join('; ');
    response.headers.set('Content-Security-Policy', csp);
  }

  // ===== AUTENTICAÇÃO =====
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: process.env.NODE_ENV === 'production', // ESSENCIAL
  });

  // VULN-NEW-04 CORRIGIDO: logs de debug apenas em desenvolvimento.
  // Em produção esses logs expunham roles e paths de todos os usuários
  // nos painéis de log (Vercel, Datadog, Sentry etc.).
  if (process.env.NODE_ENV === 'development') {
    console.log('[proxy]', pathname, token?.role ?? 'anonymous')
  }

  const isAuthPage = ['/login', '/register', '/verify-otp', '/forgot-password'].some(p => pathname.startsWith(p));

  if (isDashboard && !token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith('/master') && token?.role !== 'MASTER_ADMIN') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  if (isAuthPage && token) {
    const dest = token.role === 'MASTER_ADMIN' ? '/master/dashboard' : '/dashboard';
    return NextResponse.redirect(new URL(dest, request.url));
  }

  if (pathname.startsWith('/api/internal/')) {
    const cronSecret = request.headers.get('x-cron-secret');
    if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const protectedApiRoutes = ['/api/orders', '/api/upload', '/api/whatsapp', '/api/ai'];
  if (protectedApiRoutes.some(r => pathname.startsWith(r)) && !token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons/|screenshots/).*)',
  ],
};