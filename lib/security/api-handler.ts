// lib/security/api-handler.ts

import { NextResponse } from 'next/server'

interface HandlerOptions {
  requireJson?: boolean
  requireAuth?: boolean
  logErrors?:   boolean
}

type RouteHandler = (
  request: Request
) => Promise<NextResponse>

export function secureHandler(
  handler: RouteHandler,
  options: HandlerOptions = {}
): RouteHandler {
  const { requireJson = false, logErrors = true } = options

  return async (request: Request) => {
    try {
      if (requireJson) {
        const contentType = request.headers.get('content-type') ?? ''
        if (!contentType.includes('application/json')) {
          return NextResponse.json(
            { error: 'Content-Type deve ser application/json' },
            { status: 415 }
          )
        }
      }
      return await handler(request)
    } catch (error) {
      if (logErrors) {
        const url    = new URL(request.url)
        const method = request.method
        console.error(`[api] ${method} ${url.pathname} falhou:`, error)
      }
      return NextResponse.json(
        { error: 'Erro interno. Tente novamente.' },
        { status: 500 }
      )
    }
  }
}