// app/api/printers/[token]/route.ts

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { printerLimiter } from '@/lib/security/rate-limit'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // Sem isso, um token de impressora podia ser varrido por força bruta
  // (é um valor único, mas nada impedia tentar milhares por minuto).
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { success } = await printerLimiter.limit(ip)
  if (!success) {
    return NextResponse.json({ error: 'Muitas requisições' }, { status: 429 })
  }

  const printer = await prisma.printer.findFirst({
    where: { token },
  })

  if (!printer) {
    return NextResponse.json({ error: 'Impressora não encontrada' }, { status: 404 })
  }

  await prisma.printer.update({
    where: { id: printer.id },
    data: { lastSeenAt: new Date() },
  })

  const jobs = await prisma.printJob.findMany({
    where: { printerId: printer.id, status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take: 10,
  })

  if (jobs.length > 0) {
    await prisma.printJob.updateMany({
      where: { id: { in: jobs.map((j) => j.id) } },
      data: { attempts: { increment: 1 } },
    })
  }

  return NextResponse.json({ jobs })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const body = await req.json()
  const { jobId, status = 'PRINTED', error } = body

  const printer = await prisma.printer.findFirst({
    where: { token },
  })

  if (!printer) {
    return NextResponse.json({ error: 'Impressora não encontrada' }, { status: 404 })
  }

  await prisma.printJob.updateMany({
    where: { id: jobId, printerId: printer.id },
    data: {
      status,
      error: error ?? null,
      ...(status === 'PRINTED' ? { printedAt: new Date() } : {}),
    },
  })

  return NextResponse.json({ ok: true })
}