// app/api/otp/send/route.ts
// Envia OTP via WhatsApp para verificar cliente no checkout
//
// VULN-ALTA-04 CORRIGIDO: o atalho "alreadyVerified" confiava só na flag
// `isVerified` do cliente no banco — que nunca expira e não está presa a
// nenhum dispositivo/navegador. Bastava alguém digitar um telefone que já
// tinha sido verificado (por qualquer pessoa, em qualquer lugar) pra ser
// tratado como já autenticado, sem nunca provar posse daquele WhatsApp
// nesta sessão. Agora só pulamos o envio de um novo código se o PRÓPRIO
// navegador já apresentar um cookie de sessão válido para esse telefone +
// tenant (ver lib/security/customer-session.ts) — a flag do banco continua
// existindo só para fins de registro/analytics, não é mais usada como
// prova de identidade.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { generateOTP } from '@/lib/utils/otp'
import { sendWhatsAppMessage } from '@/lib/messaging/evolution'
import { secureHandler } from '@/lib/security/api-handler'
import { normalizePhone } from '@/lib/security/sanitize'
import { getVerifiedPhoneForTenant } from '@/lib/security/customer-session'
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

  // Verificar tenant existe
  const tenant = await prisma.tenant.findFirst({
    where: { id: parsed.data.tenantId, isActive: true },
    select: { id: true, name: true },
  })
  if (!tenant) return NextResponse.json({ error: 'Estabelecimento não encontrado' }, { status: 404 })

  // Só pula o OTP se ESTE navegador já provou, antes, que é dono deste
  // telefone (cookie httpOnly válido para este tenant) — nunca pela flag
  // isVerified do banco isolada, que qualquer um poderia "herdar" só
  // sabendo o número.
  const verifiedPhoneInThisBrowser = await getVerifiedPhoneForTenant(parsed.data.tenantId)
  if (verifiedPhoneInThisBrowser && verifiedPhoneInThisBrowser === phone) {
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
