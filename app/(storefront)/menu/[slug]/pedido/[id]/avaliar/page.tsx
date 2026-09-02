// app/(storefront)/menu/[slug]/pedido/[id]/avaliar/page.tsx

import { prisma } from '@/lib/db/client'
import { notFound } from 'next/navigation'
import { ReviewForm } from './review-form'
import type { Metadata } from 'next'
import crypto from 'crypto'

// Mesmo mecanismo HMAC usado em /api/orders/[id]/status e na action
// submitReviewAction — gerado aqui no server component e repassado ao
// client component apenas para autorizar o POST da avaliação.
function generateStatusToken(orderId: string): string {
  const secret = process.env.ORDER_TOKEN_SECRET ?? process.env.AUTH_SECRET ?? ''
  return crypto.createHmac('sha256', secret).update(orderId).digest('hex')
}

export const metadata: Metadata = { title: 'Avaliar pedido' }

interface PageProps { params: Promise<{ slug: string; id: string }> }

export default async function ReviewPage({ params }: PageProps) {
  const { slug, id } = await params

  const order = await prisma.order.findFirst({
    where: {
      id,
      status: 'DELIVERED',
      tenant: { slug },
    },
    select: {
      id: true,
      orderNumber: true,
      tenantId: true,
      review: { select: { id: true } },
      tenant: { select: { name: true, primaryColor: true, logo: true } },
      items: { take: 3, select: { productName: true } },
    },
  })

  if (!order) notFound()

  if (order.review) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">⭐</div>
          <h1 className="text-xl font-bold text-foreground mb-2">Você já avaliou este pedido</h1>
          <p className="text-muted-foreground text-sm">Obrigado pelo seu feedback!</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-4">
        <div className="max-w-md mx-auto flex items-center gap-3">
          {order.tenant.logo ? (
            <img src={order.tenant.logo} alt={order.tenant.name}
              className="w-8 h-8 rounded-lg object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
              style={{ backgroundColor: order.tenant.primaryColor ?? '#f97316' }}>
              {order.tenant.name[0]}
            </div>
          )}
          <p className="font-semibold text-foreground text-sm">{order.tenant.name}</p>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🎉</div>
          <h1 className="text-2xl font-bold text-foreground mb-1">
            Como foi seu pedido?
          </h1>
          <p className="text-muted-foreground text-sm">
            Pedido #{String(order.orderNumber).padStart(4, '0')} •{' '}
            {order.items.map((i) => i.productName).join(', ')}
            {order.items.length > 0 ? '...' : ''}
          </p>
        </div>

        <ReviewForm
          orderId={order.id}
          tenantId={order.tenantId}
          token={generateStatusToken(order.id)}
        />
      </div>
    </div>
  )
}