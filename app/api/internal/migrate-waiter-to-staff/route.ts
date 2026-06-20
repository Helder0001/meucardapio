// app/api/internal/migrate-waiter-to-staff/route.ts
//
// Endpoint one-time para renomear o valor WAITER → STAFF no enum UserRole do PostgreSQL.
// Protegido pelo CRON_SECRET. Deletar após rodar com sucesso.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'

export async function POST(request: Request) {
  const secret = request.headers.get('x-migration-secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // PostgreSQL não permite ALTER TYPE ... RENAME VALUE diretamente em versões < 14.
    // Estratégia segura para qualquer versão:
    // 1. Adicionar o novo valor STAFF ao enum
    // 2. Atualizar todos os registros WAITER → STAFF
    // 3. (O valor WAITER fica no enum mas nunca mais é usado — PG não permite DROP VALUE)

    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        -- Adiciona STAFF ao enum se ainda não existir
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum
          WHERE enumlabel = 'STAFF'
            AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'UserRole')
        ) THEN
          ALTER TYPE "UserRole" ADD VALUE 'STAFF';
        END IF;
      END$$;
    `)

    // Aguarda o commit da DDL antes de usar o novo valor
    await prisma.$executeRawUnsafe(`
      UPDATE "User" SET role = 'STAFF' WHERE role = 'WAITER';
    `)

    const count = await prisma.user.count({ where: { role: 'STAFF' as any } })

    return NextResponse.json({
      ok: true,
      message: `Migração concluída. ${count} usuários com role STAFF.`,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
