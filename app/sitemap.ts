// app/sitemap.ts
// Gera sitemap.xml dinâmico com os cardápios de todos os tenants ativos

import { MetadataRoute } from 'next'
import { prisma } from '@/lib/db/client'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Fallback: domínio real hoje é o subdomínio da Vercel — se/quando você
  // conectar um domínio próprio (ex.: meucardapio.com.br), configure a env
  // var NEXT_PUBLIC_APP_URL na Vercel com o novo domínio; não precisa
  // editar este arquivo (nem app/robots.ts, que usa a mesma env var).
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://meucardapio-teal.vercel.app'

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
