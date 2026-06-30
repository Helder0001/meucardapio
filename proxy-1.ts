import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

const RESTRICTED_ROLES = ['STAFF', 'DELIVERY_PERSON'];

const ALLOWED_EXACT = ['/dashboard'];

const ALLOWED_PREFIXES = [
  '/dashboard/orders',
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  // =========================
  // Limite de payload
  // =========================
  if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
    const contentLength = request.headers.get('content-length');

    if (contentLength) {
      const bytes = parseInt(contentLength, 10);

      const MAX_BYTES = pathname.startsWith('/api/upload')
        ? 6_000_000
        : 1_000_000;

      if (bytes > MAX_BYTES) {
        return NextResponse.json(
          { error: 'Payload muito grande' },
          { status: 413 }
        );
      }
    }
  }

  // =========================
  // Path Traversal
  // =========================
  if (
    pathname.includes('..') ||
    pathname.includes('%2e%2e')
  ) {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403 }
    );
  }

  const isDev = process.env.NODE_ENV === 'development';

  const isStorefront =
    pathname.startsWith('/menu/');

  const isDashboard =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/master');

  // =========================
  // Security Headers
  // =========================
  if (isDashboard) {
    response.headers.set('X-Frame-Options', 'DENY');
  } else if (isStorefront) {
    response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  } else {
    response.headers.set('X-Frame-Options', 'DENY');
  }

  response.headers.set(
    'X-Content-Type-Options',
    'nosniff'
  );

  response.headers.set(
    'X-DNS-Prefetch-Control',
    'on'
  );

  response.headers.set(
    'Referrer-Policy',
    'strict-origin-when-cross-origin'
  );

  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(self), payment=()'
  );

  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload'
  );

  response.headers.set(
    'X-Permitted-Cross-Domain-Policies',
    'none'
  );

  if (!isDev) {
    const csp = [
      "default-src 'self'",
      // http2.mlstatic.com é a CDN do Mercado Pago usada pelo Card Payment
      // Brick para carregar sub-scripts (cardPayment.js) e traduções (i18n/*.json)
      "script-src 'self' 'unsafe-inline' https://sdk.mercadopago.com https://http2.mlstatic.com",
      "style-src 'self' 'unsafe-inline' https://http2.mlstatic.com",
      "img-src 'self' blob: data: https:",
      "font-src 'self' https://http2.mlstatic.com",
      "connect-src 'self' https://api.mercadopago.com https://api.mercadolibre.com https://www.mercadolibre.com https://www.mercadopago.com https://events.mercadopago.com https://secure-fields.mercadopago.com https://api-static.mercadopago.com https://http2.mlstatic.com https://*.upstash.io wss:",
      "frame-src https://www.mercadopago.com https://www.mercadolibre.com https://secure-fields.mercadopago.com",
      `frame-ancestors ${isStorefront ? "'self'" : "'none'"}`,
      "base-uri 'self'",
      "form-action 'self'",
      'upgrade-insecure-requests',
    ].join('; ');

    response.headers.set(
      'Content-Security-Policy',
      csp
    );
  }

  // =========================
  // Autenticação
  // =========================
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie:
      process.env.NODE_ENV === 'production',
  });

  if (process.env.NODE_ENV === 'development') {
    console.log(
      '[proxy]',
      pathname,
      token?.role ?? 'anonymous'
    );
  }

  const isAuthPage = [
    '/login',
    '/register',
    '/verify-otp',
    '/forgot-password',
  ].some((p) => pathname.startsWith(p));

  if (isDashboard && !token) {
    const loginUrl = new URL(
      '/login',
      request.url
    );

    loginUrl.searchParams.set(
      'callbackUrl',
      pathname
    );

    return NextResponse.redirect(loginUrl);
  }

  // =========================
  // MASTER ADMIN
  // =========================
  if (
    pathname.startsWith('/master') &&
    token?.role !== 'MASTER_ADMIN'
  ) {
    return NextResponse.redirect(
      new URL('/dashboard', request.url)
    );
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
      ALLOWED_PREFIXES.some((p) =>
        pathname.startsWith(p)
      );

    if (!allowed) {
      const url = request.nextUrl.clone();

      url.pathname =
        '/dashboard/orders/kanban';

      url.search = '';

      return NextResponse.redirect(url);
    }
  }

  // =========================
  // Usuário logado tentando
  // acessar login/register
  // =========================
  if (isAuthPage && token) {
    const destination =
      token.role === 'MASTER_ADMIN'
        ? '/master/dashboard'
        : '/dashboard';

    return NextResponse.redirect(
      new URL(destination, request.url)
    );
  }

  // =========================
  // APIs internas (cron)
  // =========================
  if (pathname.startsWith('/api/internal/')) {
    const cronSecret =
      request.headers.get('x-cron-secret');

    if (
      !cronSecret ||
      cronSecret !== process.env.CRON_SECRET
    ) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
  }

  // =========================
  // APIs protegidas
  // =========================
  const protectedApiRoutes = [
    '/api/orders',
    '/api/upload',
    '/api/whatsapp',
    '/api/ai',
  ];

  if (
    protectedApiRoutes.some((route) =>
      pathname.startsWith(route)
    ) &&
    !token
  ) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons/|screenshots/).*)',
  ],
};
