// app/api/coupons/validate/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { z } from 'zod'

const schema = z.object({
  code:     z.string().min(1).max(50),
  tenantId: z.string().cuid(),
  subtotal: z.number().positive(),
})

export async function POST(req: Request) {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })

  const { code, tenantId, subtotal } = parsed.data

  const coupon = await prisma.coupon.findFirst({
    where: { code: code.toUpperCase(), tenantId, isActive: true },
  })

  if (!coupon)
    return NextResponse.json({ error: 'Cupom inválido ou expirado' }, { status: 404 })

  if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit)
    return NextResponse.json({ error: 'Cupom esgotado' }, { status: 400 })

  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date())
    return NextResponse.json({ error: 'Cupom expirado' }, { status: 400 })

  if (coupon.minOrderValue && subtotal < Number(coupon.minOrderValue))
    return NextResponse.json({
      error: `Cupom válido para pedidos acima de R$ ${Number(coupon.minOrderValue).toFixed(2).replace('.', ',')}`,
    }, { status: 400 })

  let discount = 0
  if (coupon.type === 'PERCENTAGE') {
    discount = (subtotal * Number(coupon.value)) / 100
    if (coupon.maxDiscount) discount = Math.min(discount, Number(coupon.maxDiscount))
  } else if (coupon.type === 'FIXED') {
    discount = Math.min(Number(coupon.value), subtotal)
  } else if (coupon.type === 'FREE_DELIVERY') {
    discount = 0 // frete grátis — não é desconto monetário direto
  }

  return NextResponse.json({
    valid: true,
    code: coupon.code,
    type: coupon.type,
    discount: Math.round(discount * 100) / 100,
    description: coupon.type === 'PERCENTAGE'
      ? `${Number(coupon.value)}% de desconto`
      : coupon.type === 'FIXED'
      ? `R$ ${Number(coupon.value).toFixed(2).replace('.', ',')} de desconto`
      : 'Frete grátis',
  })
}
