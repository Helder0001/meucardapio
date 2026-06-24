// app/api/internal/migrate-chat-tables/route.ts
// Endpoint one-time para criar as tabelas WhatsappChat e WhatsappMessage.
// Chame via POST com o header x-migration-secret = CRON_SECRET.
// Delete após rodar com sucesso.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'

export async function POST(request: Request) {
  const secret = request.headers.get('x-migration-secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: string[] = []

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "WhatsappChat" (
        "id"            TEXT NOT NULL PRIMARY KEY,
        "tenantId"      TEXT NOT NULL,
        "phone"         TEXT NOT NULL,
        "contactName"   TEXT,
        "lastMessage"   TEXT,
        "lastMessageAt" TIMESTAMP(3),
        "unreadCount"   INTEGER NOT NULL DEFAULT 0,
        "isOpen"        BOOLEAN NOT NULL DEFAULT true,
        "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "WhatsappChat_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      );
    `)
    results.push('WhatsappChat table created/exists')

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "WhatsappChat_tenantId_phone_key" ON "WhatsappChat"("tenantId", "phone");
    `)
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "WhatsappChat_tenantId_idx" ON "WhatsappChat"("tenantId");
    `)
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "WhatsappChat_lastMessageAt_idx" ON "WhatsappChat"("lastMessageAt");
    `)
    results.push('WhatsappChat indexes created')

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "WhatsappMessage" (
        "id"        TEXT NOT NULL PRIMARY KEY,
        "chatId"    TEXT NOT NULL,
        "tenantId"  TEXT NOT NULL,
        "body"      TEXT NOT NULL,
        "fromMe"    BOOLEAN NOT NULL DEFAULT false,
        "status"    TEXT NOT NULL DEFAULT 'received',
        "msgId"     TEXT,
        "sentById"  TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "WhatsappMessage_chatId_fkey"   FOREIGN KEY ("chatId")   REFERENCES "WhatsappChat"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "WhatsappMessage_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id")          ON DELETE SET NULL  ON UPDATE CASCADE
      );
    `)
    results.push('WhatsappMessage table created/exists')

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "WhatsappMessage_chatId_idx"   ON "WhatsappMessage"("chatId");
    `)
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "WhatsappMessage_tenantId_idx" ON "WhatsappMessage"("tenantId");
    `)
    results.push('WhatsappMessage indexes created')

    // Test insert/select
    const count = await prisma.$queryRaw<[{count: bigint}]>`SELECT COUNT(*) as count FROM "WhatsappChat"`
    results.push(`WhatsappChat rows: ${count[0].count}`)

    return NextResponse.json({ ok: true, results })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, results }, { status: 500 })
  }
}
