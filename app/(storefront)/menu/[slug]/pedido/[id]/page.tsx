// app/(storefront)/menu/[slug]/pedido/[id]/page.tsx

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { OrderTracking } from '@/components/storefront/order-tracking'
import { generateStatusToken } from '@/app/api/orders/[id]/status/route'
import { resolveTenantMpPublicKey } from '@/lib/mercadopago/resolve-token'
import { getPaymentProvider } from '@/lib/payments/provider-router'
import type { Metadata } from 'next'

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const tenant = await prisma.tenant.findFirst({
    where: { OR: [{ slug }, { customDomain: slug }] },
    select: { name: true, logo: true },
  })
  if (!tenant) return { title: 'Acompanhar pedido' }
  return {
    title: `Acompanhar pedido - ${tenant.name}`,
    openGraph: {
      title: `Acompanhar pedido - ${tenant.name}`,
      siteName: tenant.name,
      images: tenant.logo ? [tenant.logo] : undefined,
    },
  }
}

interface PageProps {
  params: Promise<{ slug: string; id: string }>
}

export default async function OrderPage({ params }: PageProps) {
  const { slug, id } = await params

  const order = await prisma.order.findFirst({
    where: { id },
    select: {
      id: true,
      tenantId: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      type: true,
      total: true,
      subtotal: true,
      deliveryFee: true,
      discountAmount: true,
      cashbackUsed: true,
      createdAt: true,
      deliveryBairro: true,
      notes: true,
      tenant: {
        select: { name: true, slug: true, primaryColor: true, logo: true },
      },
      items: {
        select: {
          id: true,
          productName: true,
          quantity: true,
          unitPrice: true,
          totalPrice: true,
          notes: true,
          addons: {
            select: { addonName: true, addonPrice: true },
          },
        },
      },
      payments: {
        where: { method: { in: ['PIX', 'CREDIT_CARD'] } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          method: true,
          status: true,
          pixQrCode: true,
          pixQrCodeBase64: true,
          pixExpiresAt: true,
          amount: true,
          cardLastDigits: true,
        },
      },
    },
  })

  if (!order || order.tenant.slug !== slug) {
    notFound()
  }

  // ✅ Gerar token HMAC no servidor para autorizar o polling de status
  const statusToken = generateStatusToken(id)

  // Public Key do MP do tenant — só é buscada quando existe pagamento
  // pendente de cartão, para não fazer essa query sem necessidade.
  let mpPublicKey: string | null = null
  let cardProvider: 'MERCADOPAGO' | 'STRIPE' | 'EFI' = 'MERCADOPAGO'
  let efiAccountIdentifier: string | null = null
  let efiSandbox = false
  const hasPendingCardPayment = order.payments[0]?.method === 'CREDIT_CARD' && order.paymentStatus !== 'PAID'
  if (hasPendingCardPayment) {
    cardProvider = await getPaymentProvider(order.tenantId, 'card')
    if (cardProvider === 'EFI') {
      const efiConnection = await prisma.efiConnection.findFirst({
        where: { tenantId: order.tenantId, revokedAt: null },
        select: { accountIdentifier: true, sandbox: true },
      })
      efiAccountIdentifier = efiConnection?.accountIdentifier ?? null
      efiSandbox = efiConnection?.sandbox ?? false
      // Sem identificador de conta cadastrado, não dá pra tokenizar — cai
      // pro MP como se nada tivesse sido escolhido (mpPublicKey abaixo
      // decide se mostra alguma coisa).
      if (!efiAccountIdentifier) cardProvider = 'MERCADOPAGO'
    }
    if (cardProvider !== 'EFI') {
      mpPublicKey = await resolveTenantMpPublicKey(order.tenantId)
    }
  }

  const { tenantId, ...orderWithoutTenantId } = order

  const serialized = {
    ...orderWithoutTenantId,
    total:          Number(order.total),
    subtotal:       Number(order.subtotal),
    deliveryFee:    Number(order.deliveryFee),
    discountAmount: Number(order.discountAmount),
    cashbackUsed:   Number(order.cashbackUsed),
    items: order.items.map((item) => ({
      ...item,
      unitPrice:  Number(item.unitPrice),
      totalPrice: Number(item.totalPrice),
      addons: item.addons.map((a) => ({
        ...a,
        addonPrice: Number(a.addonPrice),
      })),
    })),
    payments: order.payments.map((p) => ({
      ...p,
      amount: Number(p.amount),
    })),
  }

  return (
    <OrderTracking
      order={serialized}
      statusToken={statusToken}
      mpPublicKey={mpPublicKey}
      cardProvider={cardProvider}
      efiAccountIdentifier={efiAccountIdentifier}
      efiSandbox={efiSandbox}
    />
  )
}
