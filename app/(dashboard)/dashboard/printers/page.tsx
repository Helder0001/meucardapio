// app/(dashboard)/dashboard/printers/page.tsx

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { PrintersManager } from '@/components/dashboard/printers-manager'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Impressoras' }

export default async function PrintersPage() {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')

  const printers = await prisma.printer.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, token: true, sector: true, isActive: true, lastSeenAt: true, createdAt: true },
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Impressoras</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Conecte impressoras térmicas para imprimir pedidos automaticamente
        </p>
      </div>
      <PrintersManager printers={printers} />
    </div>
  )
}
