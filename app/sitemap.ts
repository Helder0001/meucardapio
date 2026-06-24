// app/sitemap.ts
// Gera sitemap.xml dinâmico com os cardápios de todos os tenants ativos

import { MetadataRoute } from 'next'
import { prisma } from '@/lib/db/client'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // CORREÇÃO: domínio padrão atualizado de foodsaas.com.br para meucardapio.com.br
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.meucardapio.com.br'

  const tenants = await prisma.tenant.findMany({
    where: { isActive: true, subscriptionStatus: { in: ['ACTIVE', 'TRIAL'] } },
    select: { slug: true, updatedAt: true },
  })

  const tenantPages: MetadataRoute.Sitemap = tenants.map((t) => ({
    url: `${baseUrl}/menu/${t.slug}`,
    lastModified: t.updatedAt,
    changeFrequency: 'daily',
    priority: 0.8,
  }))

  return [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: `${baseUrl}/login`,        changeFrequency: 'monthly', priority: 0.3 },
    { url: `${baseUrl}/register`,     changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/termos`,       changeFrequency: 'yearly',  priority: 0.2 },
    { url: `${baseUrl}/privacidade`,  changeFrequency: 'yearly',  priority: 0.2 },
    ...tenantPages,
  ]
}
