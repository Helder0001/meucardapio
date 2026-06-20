// app/(auth)/register/page.tsx

import type { Metadata } from 'next'
import { RegisterForm } from './register-form'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { AuthLogo } from '@/components/shared/auth-logo'

export const metadata: Metadata = {
  title: 'Criar conta grátis',
  description: 'Comece seu teste grátis de 7 dias',
}

// Aumenta o timeout para 60s (máximo no plano Hobby da Vercel)
// necessário pois a API do Mercado Pago /preapproval pode demorar mais que 10s
export const maxDuration = 60

const benefits = [
  'Cardápio digital com QR Code',
  'Pedidos por WhatsApp e online',
  'Painel de gestão completo',
  'Sem cartão de crédito para testar',
]

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex">
      {/* Lado esquerdo */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-orange-500 to-orange-700 flex-col justify-center p-12">
        {/* CORREÇÃO: marca "Meu Cardápio" + logo enviada pelo cliente */}
        <AuthLogo variant="light" className="mb-12" />

        <h2 className="text-3xl font-bold text-white mb-3">
          7 dias grátis,<br />sem compromisso
        </h2>
        <p className="text-orange-100 mb-8">
          Configure seu estabelecimento em minutos e comece a receber pedidos hoje.
        </p>

        <ul className="space-y-3">
          {benefits.map((b) => (
            <li key={b} className="flex items-center gap-3 text-white">
              <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <Check className="w-3 h-3" />
              </div>
              <span className="text-sm">{b}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Lado direito: formulário */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-6 py-12 lg:px-16 overflow-y-auto">
        <div className="mx-auto w-full max-w-sm">
          {/* CORREÇÃO: marca "Meu Cardápio" + logo enviada pelo cliente */}
          <AuthLogo className="mb-8 lg:hidden" />

          <h1 className="text-2xl font-bold text-foreground mb-1">
            Criar conta grátis
          </h1>
          <p className="text-muted-foreground text-sm mb-8">
            7 dias de teste • Sem cartão de crédito
          </p>

          <RegisterForm />

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Já tem conta?{' '}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
