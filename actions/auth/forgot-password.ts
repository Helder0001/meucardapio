'use server'
// actions/auth/forgot-password.ts

import { prisma } from '@/lib/db/client'
import { z } from 'zod'
import { nanoid } from 'nanoid'

export type ForgotState = { error?: string; success?: boolean }

export async function forgotPasswordAction(
  _prev: ForgotState,
  formData: FormData
): Promise<ForgotState> {
  const email = z.string().email().safeParse(formData.get('email'))
  if (!email.success) return { error: 'Email inválido' }

  // Buscar usuário — SEMPRE retornar sucesso (evita enumeração de emails)
  const user = await prisma.user.findFirst({
    where: { email: email.data.toLowerCase(), isActive: true },
    select: { id: true, name: true, email: true },
  })

  if (user) {
    // Gerar token único e seguro (64 chars)
    const token    = nanoid(64)
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hora

    // Salvar token no campo refreshTokenHash temporariamente
    // (numa implementação completa, usar tabela PasswordResetToken)
    await prisma.user.update({
      where: { id: user.id },
      data:  { refreshTokenHash: token },
    })

    // Enviar email com o link
    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${token}`

    try {
      await sendPasswordResetEmail(user.email, user.name, resetUrl)
    } catch (err) {
      console.error('[forgot-password] Erro ao enviar email:', err)
      // Não expor o erro — sempre retornar sucesso
    }
  }

  // Sempre retornar sucesso (não revelar se email existe)
  return { success: true }
}

async function sendPasswordResetEmail(email: string, name: string, resetUrl: string) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    // Em desenvolvimento sem Resend: logar o link no console
    console.log(`\n🔑 LINK DE RECUPERAÇÃO (dev): ${resetUrl}\n`)
    return
  }

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:    process.env.EMAIL_FROM ?? 'noreply@foodsaas.com',
      to:      [email],
      subject: 'Recuperação de senha — FoodSaaS',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <h1 style="color:#f97316;font-size:24px;margin-bottom:8px">FoodSaaS</h1>
          <p style="color:#374151;margin-bottom:16px">Olá${name ? `, ${name}` : ''}!</p>
          <p style="color:#374151;margin-bottom:24px">
            Recebemos uma solicitação para redefinir a senha da sua conta.
            Clique no botão abaixo para criar uma nova senha.
          </p>
          <a href="${resetUrl}"
            style="display:inline-block;background:#f97316;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-bottom:24px">
            Redefinir senha
          </a>
          <p style="color:#6b7280;font-size:13px;margin-bottom:8px">
            Este link expira em 1 hora. Se você não solicitou a redefinição, ignore este email.
          </p>
          <p style="color:#6b7280;font-size:12px">
            Ou copie e cole este link no navegador:<br/>
            <a href="${resetUrl}" style="color:#f97316">${resetUrl}</a>
          </p>
        </div>
      `,
    }),
  })
}
