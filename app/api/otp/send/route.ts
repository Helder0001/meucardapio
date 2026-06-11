// app/api/otp/send/route.ts
// Envia OTP via WhatsApp para verificar cliente no checkout

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { generateOTP } from '@/lib/utils/otp'
import { sendWhatsAppMessage } from '@/lib/messaging/evolution'
import { secureHandler } from '@/lib/security/api-handler'
import { normalizePhone } from '@/lib/security/sanitize'
import { z } from 'zod'

const schema = z.object({
  phone:    z.string().min(10),
  tenantId: z.string().cuid(),
})

export const POST = secureHandler(async (request) => {
  const ip   = request.headers.get('x-forwarded-for')?.split(',')[0] ?? '127.0.0.1'
  const body = await request.json()

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }

  const phone = normalizePhone(parsed.data.phone)
  if (!phone) {
    return NextResponse.json({ error: 'Telefone inválido' }, { status: 400 })
  }

  // Verificar se tenant existe
  const tenant = await prisma.tenant.findFirst({
    where: { id: parsed.data.tenantId, isActive: true },
    select: { id: true, name: true },
  })
  if (!tenant) return NextResponse.json({ error: 'Estabelecimento não encontrado' }, { status: 404 })

  // Verificar se cliente já está verificado
  const existing = await prisma.customer.findFirst({
    where: { phone, tenantId: parsed.data.tenantId },
    select: { isVerified: true },
  })
  if (existing?.isVerified) {
    return NextResponse.json({ alreadyVerified: true })
  }

  // Gerar OTP (com rate limit interno)
  const { code, error } = await generateOTP(phone, parsed.data.tenantId, ip)
  if (error) return NextResponse.json({ error }, { status: 429 })

  // Enviar via WhatsApp
  const message = `🔐 *${tenant.name}*\n\nSeu código de verificação: *${code}*\n\nVálido por 5 minutos. Não compartilhe com ninguém.`

  const sent = await sendWhatsAppMessage({ tenantId: parsed.data.tenantId, phone, message })

  if (sent.error) {
    // WhatsApp não configurado — em dev, logar o código
    if (process.env.NODE_ENV === 'development') {
      console.log(`\n📱 OTP para ${phone}: ${code}\n`)
      return NextResponse.json({ ok: true, devCode: code })
    }
    return NextResponse.json({ error: 'Erro ao enviar código. Tente novamente.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}, { requireJson: true })
