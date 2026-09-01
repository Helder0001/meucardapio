// lib/auth/config.ts

import { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { prisma } from '@/lib/db/client';
import { verifyPassword } from '@/lib/auth/password';
import { loginLimiter, loginEmailLimiter } from '@/lib/security/rate-limit';
import { encrypt, decrypt } from '@/lib/security/crypto';
import { verifyMfaCode } from '@/actions/auth/mfa';
import { z } from 'zod';

// VULN-CRIT-05 CORRIGIDO: o auth callback autenticava e emitia sessão só
// com email+senha, mesmo para usuários com mfaEnabled=true — o segundo
// fator nunca era verificado. Agora, quando o usuário tem MFA ativado,
// authorize() emite um "desafio" (mfaToken) em vez da sessão completa;
// a sessão só é emitida na segunda chamada, com o mfaToken + o código
// TOTP/backup válido. O mfaToken é um blob AES-256-GCM autenticado
// (mesma primitiva usada para o mfaSecret) contendo {userId, exp}, então
// não pode ser forjado nem reaproveitado após expirar.
const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;

function issueMfaChallengeToken(userId: string): string {
  return encrypt(JSON.stringify({ userId, exp: Date.now() + MFA_CHALLENGE_TTL_MS }));
}

function readMfaChallengeToken(token: string): { userId: string } | null {
  try {
    const { userId, exp } = JSON.parse(decrypt(token)) as { userId: string; exp: number };
    if (!userId || typeof exp !== 'number' || exp < Date.now()) return null;
    return { userId };
  } catch {
    // token adulterado, expirado ou de formato inválido
    return null;
  }
}

const loginSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  password: z.string().min(8),
});

// Segunda etapa do login (após TOTP_REQUIRED): não reenvia a senha, só o
// desafio emitido na primeira etapa + o código TOTP/backup.
const mfaStepSchema = z.object({
  mfaToken: z.string().min(1),
  code: z.string().min(6).max(64),
});

const SESSION_MAX_AGE = 30 * 60;
const SESSION_UPDATE_AGE = 5 * 60;

export const authConfig: NextAuthConfig = {
  // 🔧 Secret usada para assinar/verificar os tokens de sessão.
  // VULN-ALTA-01 CORRIGIDO: o .env.example documenta AUTH_SECRET, mas o
  // código só lia NEXTAUTH_SECRET — se a env na Vercel se chamasse
  // AUTH_SECRET, o NextAuth rodava sem secret fixo. Padronizado em
  // AUTH_SECRET, com fallback pro nome antigo pra não quebrar sessões
  // já assinadas em ambientes que ainda usam NEXTAUTH_SECRET.
  // IMPORTANTE: proxy.ts usa exatamente a mesma expressão — os dois
  // precisam concordar, ou o middleware não vai conseguir ler o token
  // gerado aqui.
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,

  trustHost: true,

  session: {
    strategy: 'jwt',
    maxAge: SESSION_MAX_AGE,
    updateAge: SESSION_UPDATE_AGE,
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Senha', type: 'password' },
        // Presentes apenas na 2ª etapa do login (usuário com MFA ativado)
        mfaToken: { label: 'MFA Token', type: 'text' },
        code: { label: 'Código', type: 'text' },
      },

      async authorize(credentials, request) {
        const ip =
          request?.headers?.get('x-forwarded-for')?.split(',')[0] ??
          '127.0.0.1';

        // ── Etapa 2: usuário já validou email+senha e agora está
        // confirmando o código TOTP/backup do desafio emitido na etapa 1.
        if (credentials?.mfaToken) {
          const mfaParsed = mfaStepSchema.safeParse(credentials);
          if (!mfaParsed.success) return null;

          const challenge = readMfaChallengeToken(mfaParsed.data.mfaToken);
          if (!challenge) return null; // token expirado, adulterado ou inválido

          const { valid } = await verifyMfaCode(challenge.userId, mfaParsed.data.code);
          if (!valid) return null;

          const user = await prisma.user.findFirst({
            where: { id: challenge.userId, isActive: true },
            include: {
              tenant: {
                select: { id: true, slug: true, plan: true, subscriptionStatus: true, isActive: true },
              },
            },
          });
          if (!user) return null;

          if (user.role !== 'MASTER_ADMIN') {
            if (!user.tenant?.isActive) return null;
            if (user.tenant?.subscriptionStatus === 'SUSPENDED') return null;
          }

          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginCount: 0,
              lockedUntil: null,
              lastLoginAt: new Date(),
              lastLoginIp: ip,
            },
          });

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            tenantId: user.tenantId,
            tenantSlug: user.tenant?.slug ?? null,
            plan: user.tenant?.plan ?? null,
            passwordChangedAt: user.passwordChangedAt?.getTime() ?? null,
          };
        }

        // ── Etapa 1: email + senha
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const email = parsed.data.email;

        const user = await prisma.user.findFirst({
          where: {
            email,
            isActive: true,
          },
          include: {
            tenant: {
              select: {
                id: true,
                slug: true,
                plan: true,
                subscriptionStatus: true,
                isActive: true,
              },
            },
          },
        });

        if (!user) {
          await new Promise((r) => setTimeout(r, 200 + Math.random() * 100));
          return null;
        }

        if (user.lockedUntil && user.lockedUntil > new Date()) {
          return null;
        }

        const passwordValid = await verifyPassword(
          parsed.data.password,
          user.passwordHash
        );

        if (!passwordValid) {
          const newCount = user.failedLoginCount + 1;

          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginCount: newCount,
              lockedUntil:
                newCount >= 10
                  ? new Date(Date.now() + 15 * 60 * 1000)
                  : null,
            },
          });

          return null;
        }

        // Proteção de tenant
        if (user.role !== 'MASTER_ADMIN') {
          if (!user.tenant?.isActive) return null;

          if (user.tenant?.subscriptionStatus === 'SUSPENDED') {
            return null;
          }
        }

        // MFA ativado: não emitir sessão ainda. Devolve um desafio
        // (mfaToken) embutido na mensagem de erro — o mesmo padrão já
        // usado por RATE_LIMIT/ACCOUNT_LOCKED/TENANT_SUSPENDED — para o
        // frontend capturar e pedir o código TOTP/backup na 2ª etapa.
        // IMPORTANTE: o contador de tentativas falhas só é zerado e
        // lastLoginAt só é atualizado depois que o código MFA também for
        // validado (etapa 2 acima), não aqui.
        if (user.mfaEnabled) {
          const mfaToken = issueMfaChallengeToken(user.id);
          throw new Error(`TOTP_REQUIRED:${mfaToken}`);
        }

        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: 0,
            lockedUntil: null,
            lastLoginAt: new Date(),
            lastLoginIp: ip,
          },
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
          tenantSlug: user.tenant?.slug ?? null,
          plan: user.tenant?.plan ?? null,
          passwordChangedAt: user.passwordChangedAt?.getTime() ?? null,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as any).role;
        token.tenantId = (user as any).tenantId;
        token.tenantSlug = (user as any).tenantSlug;
        token.plan = (user as any).plan;
        token.passwordChangedAt = (user as any).passwordChangedAt;
      }

      // Invalida sessão se a senha foi alterada
      if (
        typeof token.passwordChangedAt === 'number' &&
        typeof token.iat === 'number' &&
        token.iat < token.passwordChangedAt / 1000
      ) {
        return {} as any;
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.tenantId = token.tenantId as string | null;
        session.user.tenantSlug = token.tenantSlug as string | null;
        session.user.plan = token.plan as string | null;
      }

      return session;
    },
  },
};