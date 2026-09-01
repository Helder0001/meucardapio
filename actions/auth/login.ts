'use server'

// actions/auth/login.ts
// VULN-11 CORRIGIDO: validação de dados de entrada mais rigorosa
// VULN-12 CORRIGIDO: erros internos não expostos ao cliente
// VULN-CRIT-05 CORRIGIDO: loginAction agora trata o erro TOTP_REQUIRED
// (lançado por authorize() em lib/auth/config.ts quando o usuário tem MFA
// ativado) e devolve o mfaToken para o formulário pedir o código — em vez
// de simplesmente emitir a sessão sem checar o segundo fator.

import { signIn } from '@/lib/auth/session'
import { z } from 'zod'
import { auditLog, AuditActions } from '@/lib/utils/audit'
import { sanitizeText } from '@/lib/security/sanitize'

const loginSchema = z.object({
  email: z.string().email('Email inválido').toLowerCase().max(254),
  password: z.string().min(1, 'Senha obrigatória').max(128),
  callbackUrl: z.string().optional(),
})

const mfaLoginSchema = z.object({
  mfaToken: z.string().min(1),
  code: z.string().min(6, 'Código inválido').max(64),
  callbackUrl: z.string().optional(),
})

export type LoginState = {
  errors?: {
    email?: string[]
    password?: string[]
    code?: string[]
    general?: string[]
  }
  success?: boolean
  mfaRequired?: boolean
  mfaToken?: string
}

// Extrai o texto do desafio de um erro no formato "TOTP_REQUIRED:<token>"
function parseTotpChallenge(message: string): string | null {
  if (!message.startsWith('TOTP_REQUIRED:')) return null
  return message.slice('TOTP_REQUIRED:'.length)
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

    // NextAuth encapsula o Error original de authorize() numa mensagem
    // genérica ("CredentialsSignin") ou, dependendo da versão, preserva a
    // causa em error.cause — tentamos ambos os formatos.
    const rawMessage =
      (error as any)?.cause?.err?.message ??
      (error as any)?.cause?.message ??
      message

    const totpToken = parseTotpChallenge(rawMessage)
    if (totpToken) {
      return {
        mfaRequired: true,
        mfaToken: totpToken,
      }
    }

    const errorMessages: Record<string, string> = {
      RATE_LIMIT: 'Muitas tentativas. Aguarde 1 minuto.',
      ACCOUNT_LOCKED: 'Conta bloqueada. Tente em 15 minutos.',
      TENANT_SUSPENDED: 'Estabelecimento suspenso. Contate o suporte.',
      CredentialsSignin: 'Email ou senha incorretos.',
    }

    return {
      errors: {
        general: [
          errorMessages[rawMessage] ?? errorMessages[message] ?? 'Email ou senha incorretos.',
        ],
      },
    }
  }
}

// Segunda etapa do login: usuário com MFA ativado envia o código
// TOTP/backup junto com o mfaToken emitido na primeira etapa.
export async function mfaLoginAction(
  prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const raw = {
    mfaToken: formData.get('mfaToken'),
    code: formData.get('code'),
    callbackUrl: formData.get('callbackUrl') ?? undefined,
  }

  const parsed = mfaLoginSchema.safeParse(raw)

  if (!parsed.success) {
    return {
      mfaRequired: true,
      mfaToken: typeof raw.mfaToken === 'string' ? raw.mfaToken : undefined,
      errors: parsed.error.flatten().fieldErrors,
    }
  }

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
      mfaToken: parsed.data.mfaToken,
      code: parsed.data.code,
      redirectTo,
    })

    return { success: true }
  } catch (error: any) {
    if (
      error &&
      typeof error === 'object' &&
      'digest' in error &&
      typeof error.digest === 'string' &&
      error.digest.startsWith('NEXT_REDIRECT')
    ) {
      throw error
    }

    console.error('MFA LOGIN ERROR:', error)

    // Código errado ou token expirado: volta pra tela de código, sem
    // vazar qual dos dois foi o motivo.
    return {
      mfaRequired: true,
      mfaToken: parsed.data.mfaToken,
      errors: {
        code: ['Código inválido ou expirado. Tente novamente.'],
      },
    }
  }
}