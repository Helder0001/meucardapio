// app/(dashboard)/dashboard/customers/page.tsx

import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/client'
import { CustomersTable } from '@/components/dashboard/customers/customers-table'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Clientes' }

interface PageProps {
  searchParams: Promise<{ page?: string; q?: string }>
}

export default async function CustomersPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user?.tenantId) redirect('/login')

  const { page: pageParam, q: qParam } = await searchParams

  const tenantId = session.user.tenantId
  const page     = Math.max(1, Number(pageParam ?? 1))
  const pageSize = 20
  const skip     = (page - 1) * pageSize
  const q        = qParam?.trim()

  const where = {
    tenantId,
    anonymizedAt: null,
    ...(q ? {
      OR: [
        { name:  { contains: q, mode: 'insensitive' as const } },
        { phone: { contains: q } },
        { email: { contains: q, mode: 'insensitive' as const } },
      ],
    } : {}),
  }

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { lastOrderAt: { sort: 'desc', nulls: 'last' } },
      skip,
      take: pageSize,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        totalOrders: true,
        totalSpent: true,
        loyaltyPoints: true,
        cashbackBalance: true,
        lastOrderAt: true,
        createdAt: true,
        isVerified: true,
      },
    }),
    prisma.customer.count({ where }),
  ])

  const serialized = customers.map((c) => ({
    ...c,
    totalSpent:      Number(c.totalSpent),
    cashbackBalance: Number(c.cashbackBalance),
  }))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {total} cliente{total !== 1 ? 's' : ''} cadastrado{total !== 1 ? 's' : ''}
        </p>
      </div>
      <CustomersTable
        customers={serialized}
        total={total}
        page={page}
        pageSize={pageSize}
        query={q ?? ''}
      />
    </div>
  )
}