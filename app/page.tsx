// app/page.tsx
//
// Server Component só pra poder exportar metadata própria da home — o
// conteúdo/interatividade real mora em components/marketing/home-page-client.tsx
// (Client Component, por causa do tema claro/escuro e do menu mobile).
//
// CORREÇÃO: antes este arquivo era 'use client' direto, então a home
// (a página mais importante do site pro Google) só herdava o title/
// description GENÉRICOS do app/layout.tsx raiz, sem nada otimizado pra
// intenção de busca de quem procura "cardápio digital para restaurante".

import type { Metadata } from 'next'
import { HomePageClient } from '@/components/marketing/home-page-client'

export const metadata: Metadata = {
  title: 'Cardápio Digital para Restaurantes com QR Code, PIX e Delivery',
  description:
    'Crie o cardápio digital do seu restaurante com QR Code por mesa, pedidos online, Kanban de cozinha em tempo real, PIX automático e WhatsApp integrado.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Meu Cardápio — Cardápio Digital, Pedidos e PIX para Restaurantes',
    description:
      'QR Code por mesa, delivery, Kanban em tempo real e PIX automático — tudo numa plataforma só. Veja a demo ao vivo.',
    url: '/',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Meu Cardápio — Cardápio Digital para Restaurantes',
    description:
      'QR Code por mesa, delivery, Kanban em tempo real e PIX automático — tudo numa plataforma só.',
  },
}

export default function HomePage() {
  return <HomePageClient />
}
