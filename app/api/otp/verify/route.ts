// app/api/otp/verify/route.ts
// VULN-ALTA-04 CORRIGIDO: além de confirmar o OTP, agora emite um cookie
// httpOnly assinado (lib/security/customer-session.ts) que passa a ser a
// única prova de identidade aceita nas rotas do storefront — antes disso,
// nada vinculava a verificação a este navegador/dispositivo.

import { NextResponse } from 'next/server'
import { verifyOTP } from '@/lib/utils/otp'
import { secureHandler } from '@/lib/security/api-handler'
import { normalizePhone } from '@/lib/security/sanitize'
import { setCustomerSessionCookie } from '@/lib/security/customer-session'
import { z } from 'zod'

const schema = z.object({
  phone:    z.string().min(10),
  tenantId: z.string().cuid(),
  code:     z.string().length(6).regex(/^\d+$/, 'Código deve ter 6 dígitos'),
})

export const POST = secureHandler(async (request) => {
  const ip   = request.headers.get('x-forwarded-for')?.split(',')[0] ?? '127.0.0.1'
  const body = await request.json()

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const phone = normalizePhone(parsed.data.phone)
  if (!phone) return NextResponse.json({ error: 'Telefone inválido' }, { status: 400 })

  const result = await verifyOTP(phone, parsed.data.tenantId, parsed.data.code, ip)

  if (!result.valid) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  await setCustomerSessionCookie(phone, parsed.data.tenantId)

  return NextResponse.json({ ok: true, verified: true })
}, { requireJson: true })
