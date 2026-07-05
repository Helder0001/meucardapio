// app/(storefront)/menu/[slug]/page.tsx

import { prisma } from '@/lib/db/client'
import { StorefrontClient } from '@/components/storefront/storefront-client'
import { isOutOfStock } from '@/lib/utils/stock'
import { UtensilsCrossed } from 'lucide-react'
import type { Metadata } from 'next'

export const revalidate = 60

interface PageProps {
  params:       Promise<{ slug: string }>
  searchParams: Promise<{ table?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const tenant = await getTenantMenu(slug)
  if (!tenant) return { title: 'Cardapio Digital' }
  return {
    title:       `Cardapio - ${tenant.name}`,
    description: `Faca seu pedido online na ${tenant.name}`,
    openGraph: {
      title: `Cardapio - ${tenant.name}`,
      description: `Faca seu pedido online na ${tenant.name}`,
      siteName: tenant.name,
      images: tenant.logo ? [tenant.logo] : undefined,
    },
  }
}

async function getTenantMenu(slug: string) {
  return prisma.tenant.findFirst({
    where: { OR: [{ slug }, { customDomain: slug }], isActive: true },
    select: {
      id: true, name: true, slug: true, logo: true,
      primaryColor: true, phone: true, settings: true,
      subscriptionStatus: true,
      categories: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true, name: true, image: true, sortOrder: true,
          products: {
            where: { isActive: true },
            orderBy: [{ isFeatured: 'desc' }, { sortOrder: 'asc' }],
            select: {
              id: true, name: true, description: true, price: true,
              comparePrice: true, image: true, isFeatured: true,
              isBestSeller: true, preparationTime: true, tags: true,
              stocks: { select: { quantity: true } },
              addonGroups: {
                select: {
                  addonGroup: {
                    select: {
                      id: true, name: true, minSelect: true,
                      maxSelect: true, isRequired: true,
                      addons: {
                        where: { isActive: true },
                        orderBy: { sortOrder: 'asc' },
                        select: { id: true, name: true, price: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      businessHours: {
        select: { dayOfWeek: true, openTime: true, closeTime: true, isOpen: true },
      },
      deliveryZones: {
        where: { isActive: true },
        select: { id: true, type: true, name: true, bairro: true, fee: true, freeAbove: true, minOrder: true, maxTime: true },
      },
    },
  })
}

function isOpenNow(businessHours: any[], settings: any): { open: boolean; message?: string } {
  if (settings?.manualOpen === true)  return { open: true }
  if (settings?.manualOpen === false) return { open: false, message: settings?.closedMessage ?? 'Fechado no momento.' }

  const now         = new Date()
  const brTime      = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const dayOfWeek   = brTime.getDay()
  const currentTime = brTime.toTimeString().slice(0, 5)
  const todayHours  = businessHours.find((h: any) => h.dayOfWeek === dayOfWeek)

  if (!todayHours || !todayHours.isOpen) return { open: false, message: 'Fechado hoje.' }
  if (currentTime >= todayHours.openTime && currentTime <= todayHours.closeTime) return { open: true }
  return { open: false, message: `Fechado. Abrimos as ${todayHours.openTime}.` }
}

function UnavailablePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
          <UtensilsCrossed className="w-7 h-7 text-gray-400" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Cardápio não disponível</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm">Este cardápio não está disponível no momento.</p>
      </div>
    </div>
  )
}

export default async function StorefrontPage({ params, searchParams }: PageProps) {
  const { slug }  = await params
  const { table } = await searchParams

  const tenant = await getTenantMenu(slug)

  if (!tenant || tenant.subscriptionStatus === 'SUSPENDED') {
    return <UnavailablePage />
  }

  const { open, message: closedMessage } = isOpenNow(tenant.businessHours, tenant.settings as any)

  let tableInfo: { id: string; number: number; sector: string } | null = null
  if (table) {
    const tableRecord = await prisma.table.findFirst({
      where: { qrCode: table, tenantId: tenant.id, isActive: true },
      select: { id: true, number: true, sector: true },
    })
    if (tableRecord) tableInfo = tableRecord
  }

  const menuData = {
    ...tenant,
    categories: tenant.categories.map((cat) => ({
      ...cat,
      products: cat.products.map((p) => ({
        ...p,
        price:        Number(p.price),
        comparePrice: p.comparePrice ? Number(p.comparePrice) : null,
        isOutOfStock: isOutOfStock(p.stocks),
        stocks:       undefined, // não enviar saldo bruto ao cliente, só o booleano
        addonGroups:  p.addonGroups.map((g) => ({
          ...g.addonGroup,
          addons: g.addonGroup.addons.map((a) => ({ ...a, price: Number(a.price) })),
        })),
      })),
    })),
    pixEnabled: (tenant.settings as any)?.pixEnabled ?? true,
    cardEnabled: (tenant.settings as any)?.cardEnabled ?? true,
    linkEnabled: (tenant.settings as any)?.linkEnabled ?? true,
    deliveryZones: tenant.deliveryZones.map((z) => ({
      ...z,
      fee:       Number(z.fee),
      freeAbove: z.freeAbove ? Number(z.freeAbove) : null,
      minOrder:  z.minOrder  ? Number(z.minOrder)  : null,
    })),
  }

  return (
    <StorefrontClient
      tenant={menuData}
      tableInfo={tableInfo}
      isOpen={open}
      closedMessage={closedMessage}
    />
  )
}
