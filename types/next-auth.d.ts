// types/next-auth.d.ts
//
// Extende os tipos padrão do NextAuth para incluir nossos campos customizados.
// Sem isso, TypeScript reclamaria de `session.user.role`, `session.user.tenantId`, etc.

import { DefaultSession, DefaultJWT } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: string
      tenantId: string | null
      tenantSlug: string | null
      plan: string | null
    } & DefaultSession['user']
  }

  interface User {
    role: string
    tenantId: string | null
    tenantSlug: string | null
    plan: string | null
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string
    role: string
    tenantId: string | null
    tenantSlug: string | null
    plan: string | null
  }
}
