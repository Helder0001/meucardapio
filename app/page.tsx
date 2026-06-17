// app/page.tsx — Server Component (metadata aqui, UI no client)
import type { Metadata } from 'next'
import { HomePageClient } from './home-client'

export const metadata: Metadata = {
  title: 'FoodSaaS — Cardápio Digital, Delivery e Gestão para Restaurantes',
  description: 'Plataforma completa para restaurantes, pizzarias e deliveries. Cardápio digital com QR Code, pedidos online, WhatsApp, relatórios e muito mais.',
}

export default function HomePage() {
  return <HomePageClient />
}
