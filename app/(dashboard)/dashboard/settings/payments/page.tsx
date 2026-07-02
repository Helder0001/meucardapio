// app/(dashboard)/dashboard/settings/payments/page.tsx

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { PaymentSettingsForm } from '@/components/dashboard/payment-settings-form'
import { Suspense } from 'react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Configurações de Pagamento' }

export default async function PaymentSettingsPage() {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')

  const tenant = await prisma.tenant.findFirst({
    where: { id: session.user.tenantId },
    select: { settings: true },
  })

  if (!tenant) redirect('/login')

  const settings = (tenant.settings as Record<string, any>) ?? {}

  const hasSecret = !!settings.mercadoPagoWebhookSecret
  const pixEnabled = (settings.pixEnabled ?? true) === true
  const cardEnabled = (settings.cardEnabled ?? true) === true

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Pagamentos</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Conecte sua conta do Mercado Pago para receber PIX e cartão dos seus clientes
        </p>
      </div>

      <Suspense fallback={null}>
        <PaymentSettingsForm
          hasSecret={hasSecret}
          pixEnabled={pixEnabled}
          cardEnabled={cardEnabled}
        />
      </Suspense>
    </div>
  )
}
