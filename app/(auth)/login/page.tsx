// app/(auth)/login/page.tsx

import type { Metadata } from 'next'
import { LoginForm } from './login-form'
import Link from 'next/link'
import { ArrowLeft, Lock, Flag, Zap } from 'lucide-react'
import { AuthLogo } from '@/components/shared/auth-logo'

export const metadata: Metadata = {
  title: 'Entrar',
  description: 'Acesse o painel do seu restaurante',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>
}) {
  const params = await searchParams

  return (
    <div className="min-h-screen flex">
      {/* Lado esquerdo: visual */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-orange-500 to-orange-700 flex-col justify-between p-12">
        {/* Mesh gradient sutil — antes era um gradiente liso sem profundidade */}
        <div className="absolute -top-24 -left-16 w-96 h-96 rounded-full bg-orange-300/30 blur-3xl animate-float" />
        <div className="absolute top-1/3 -right-24 w-80 h-80 rounded-full bg-red-400/20 blur-3xl animate-float-delay" />
        <div className="absolute -bottom-32 left-1/4 w-96 h-96 rounded-full bg-amber-300/20 blur-3xl animate-pulse-slow" />

        {/* CORREÇÃO: marca "Meu Cardápio" + logo enviada pelo cliente */}
        <div className="relative"><AuthLogo variant="light" /></div>

        <div className="relative">
          <blockquote className="text-white">
            <p className="text-2xl font-semibold leading-relaxed">
              "Aumentamos nosso faturamento em 40% em 3 meses usando o cardápio digital."
            </p>
            <footer className="mt-4 text-orange-100">
              <strong>João Silva</strong> — Hamburgueria do João, São Paulo
            </footer>
          </blockquote>
        </div>

        <div className="relative flex gap-4 text-orange-100 text-sm">
          <span className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> SSL seguro</span>
          <span className="flex items-center gap-1.5"><Flag className="h-3.5 w-3.5" /> Dados no Brasil</span>
          <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" /> 99.9% uptime</span>
        </div>
      </div>

      {/* Lado direito: formulário */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-6 py-12 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          {/* Botão voltar para o site */}
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao site
          </Link>

          {/* Logo mobile — CORREÇÃO: marca "Meu Cardápio" + logo */}
          <AuthLogo className="mb-8 lg:hidden" />

          <h1 className="text-2xl font-bold text-foreground mb-1">
            Bem-vindo de volta
          </h1>
          <p className="text-muted-foreground text-sm mb-8">
            Entre com sua conta para acessar o painel
          </p>

          <LoginForm
            callbackUrl={params.callbackUrl}
            urlError={params.error}
          />

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Não tem conta?{' '}
            <Link
              href="/register"
              className="font-medium text-primary hover:underline"
            >
              Criar conta grátis
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
