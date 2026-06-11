// lib/db/client.ts
//
// Por que singleton?
// Em desenvolvimento, o Next.js recarrega módulos a cada mudança (hot reload).
// Sem o singleton, criaríamos centenas de conexões com o banco.
// Esta é a solução oficial recomendada pelo Prisma para Next.js.

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
