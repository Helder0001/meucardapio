// app/robots.ts
//
// Substitui public/robots.txt (estático) por uma versão dinâmica que lê
// a MESMA env var que o app/sitemap.ts (NEXT_PUBLIC_APP_URL) — assim o
// domínio do "Sitemap:" nunca mais desincroniza do domínio real do site,
// o que já aconteceu uma vez (apontava pro domínio antigo foodsaas.com.br
// enquanto o sitemap.ts já tinha sido corrigido).
//
// IMPORTANTE: com esse arquivo presente, remova public/robots.txt — se os
// dois existirem, o Next.js serve o arquivo estático em public/ e ignora
// este aqui.

import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  // Mesmo fallback do app/sitemap.ts. Se/quando o domínio definitivo mudar
  // (ex.: conectar meucardapio.com.br na Vercel), basta atualizar a env
  // var NEXT_PUBLIC_APP_URL — nada aqui precisa ser editado à mão.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://meucardapio-teal.vercel.app'

  return {
    rules: {
      userAgent: '*',
      allow: ['/menu/'],
      disallow: ['/dashboard/', '/master/', '/api/', '/login', '/register'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
