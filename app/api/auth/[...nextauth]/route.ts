// app/api/auth/[...nextauth]/route.ts
//
// Este arquivo conecta o Auth.js ao sistema de rotas do Next.js.
// Não tem lógica aqui — só exporta os handlers do Auth.js.
// As rotas geradas automaticamente são:
//   POST /api/auth/signin
//   POST /api/auth/signout
//   GET  /api/auth/session
//   GET  /api/auth/csrf
//   GET  /api/auth/providers

import { handlers } from '@/lib/auth/session'

export const { GET, POST } = handlers
