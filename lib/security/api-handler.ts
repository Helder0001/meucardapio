// lib/security/api-handler.ts

import { NextResponse } from 'next/server'

// VULN-INFO-08 CORRIGIDO: a interface declarava `requireAuth?: boolean`,
// mas secureHandler() nunca lia essa opção — não tinha nenhum efeito.
// Hoje nenhuma rota passa essa opção (só otp/send e otp/verify usam
// secureHandler, e os dois são endpoints públicos de propósito), mas era
// uma armadilha: um desenvolvedor futuro que passasse
// `{ requireAuth: true }` assumiria, incorretamente, que a rota estava
// protegida. Removida em vez de implementada, porque este wrapper não
// tem contexto sobre QUAL mecanismo de auth se aplica a cada rota
// (sessão de dashboard via lib/auth/session, cookie de cliente via
// lib/security/customer-session, segredo de cron, etc.) — a checagem de
// autorização continua sendo responsabilidade explícita de cada handler,
// como já é feito em todas as outras rotas do projeto.
interface HandlerOptions {
  requireJson?: boolean
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