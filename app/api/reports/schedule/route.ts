// app/api/reports/schedule/route.ts
// GET  → listar agendamentos do tenant
// POST → criar agendamento
// DELETE → remover agendamento

export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/session'
import { hasPermission, type UserRole } from '@/lib/auth/permissions'
import { prisma } from '@/lib/db/client'
import { z } from 'zod'

const scheduleSchema = z.object({
  email:     z.string().email('E-mail inválido'),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
  reportType: z.enum(['orders', 'products']),
  dayOfWeek: z.number().min(0).max(6).optional(), // 0=dom, 1=seg...
  hour:      z.number().min(0).max(23).default(8),
})

export async function GET() {
  const session = await auth()
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // VULN-ALTA-05 CORRIGIDO: ver mesma correção em reports/export/route.ts
  if (!hasPermission(session.user.role as UserRole, 'reports:view')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const schedules = await (prisma as any).reportSchedule.findMany({
    where: { tenantId: session.user.tenantId, isActive: true },
    orderBy: { createdAt: 'desc' },
  }).catch(() => [])

  return NextResponse.json({ schedules })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // VULN-ALTA-05 CORRIGIDO: ver mesma correção em reports/export/route.ts
  if (!hasPermission(session.user.role as UserRole, 'reports:export')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const body   = await request.json()
  const parsed = scheduleSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })

  const { email, frequency, reportType, dayOfWeek, hour } = parsed.data

  const schedule = await (prisma as any).reportSchedule.create({
    data: {
      tenantId:   session.user.tenantId,
      createdById: session.user.id,
      email,
      frequency,
      reportType,
      dayOfWeek:  dayOfWeek ?? null,
      hour,
      isActive:   true,
    },
  }).catch((err: any) => {
    throw new Error(err.message?.includes('does not exist') ? 'tabela_ausente' : err.message)
  })

  return NextResponse.json({ schedule })
}

export async function DELETE(request: Request) {
  const session = await auth()
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // VULN-ALTA-05 CORRIGIDO: ver mesma correção em reports/export/route.ts
  if (!hasPermission(session.user.role as UserRole, 'reports:export')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await request.json()
  await (prisma as any).reportSchedule.updateMany({
    where: { id, tenantId: session.user.tenantId },
    data:  { isActive: false },
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
