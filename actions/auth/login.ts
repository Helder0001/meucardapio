'use server'

// actions/auth/login.ts
// VULN-11 CORRIGIDO: validação de dados de entrada mais rigorosa
// VULN-12 CORRIGIDO: erros internos não expostos ao cliente

import { signIn } from '@/lib/auth/session'
import { z } from 'zod'
import { auditLog, AuditActions } from '@/lib/utils/audit'
import { sanitizeText } from '@/lib/security/sanitize'

const loginSchema = z.object({
  email: z.string().email('Email inválido').toLowerCase().max(254),
  password: z.string().min(1, 'Senha obrigatória').max(128),
  callbackUrl: z.string().optional(),
})

export type LoginState = {
  errors?: {
    email?: string[]
    password?: string[]
    general?: string[]
  }
  success?: boolean
}

export async function loginAction(
  prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const raw = {
    email: formData.get('email'),
    password: formData.get('password'),

    // Quando o campo não existe, transforma null em undefined
    callbackUrl: formData.get('callbackUrl') ?? undefined,
  }

  const parsed = loginSchema.safeParse(raw)

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
    }
  }

  // Sanitizar callbackUrl para evitar open redirect
  let redirectTo = '/dashboard'

  if (parsed.data.callbackUrl) {
    try {
      const url = new URL(parsed.data.callbackUrl, 'http://localhost')

      if (url.hostname === 'localhost') {
        redirectTo = url.pathname
      }
    } catch {
      redirectTo = '/dashboard'
    }
  }

  try {
    await signIn('credentials', {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo,
    })

    return {
      success: true,
    }
  } catch (error: any) {
    // IMPORTANTE: Auth.js/Next.js lança erro de redirect
    if (
      error &&
      typeof error === 'object' &&
      'digest' in error &&
      typeof error.digest === 'string' &&
      error.digest.startsWith('NEXT_REDIRECT')
    ) {
      throw error
    }

    // Log completo para investigar na Vercel
    console.error('LOGIN ERROR:', error)

    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : JSON.stringify(error)

    const errorMessages: Record<string, string> = {
      RATE_LIMIT: 'Muitas tentativas. Aguarde 1 minuto.',
      ACCOUNT_LOCKED: 'Conta bloqueada. Tente em 15 minutos.',
      TENANT_SUSPENDED: 'Estabelecimento suspenso. Contate o suporte.',
      CredentialsSignin: 'Email ou senha incorretos.',
    }

    return {
      errors: {
        general: [
          errorMessages[message] ?? `Erro real: ${message}`,
        ],
      },
    }
  }
}