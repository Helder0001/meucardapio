// lib/auth/config.ts

import { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { prisma } from '@/lib/db/client';
import { verifyPassword } from '@/lib/auth/password';
import { loginLimiter, loginEmailLimiter } from '@/lib/security/rate-limit';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  password: z.string().min(8),
});

const SESSION_MAX_AGE = 30 * 60;
const SESSION_UPDATE_AGE = 5 * 60;

export const authConfig: NextAuthConfig = {
  // 🔧 ADICIONADO: Define explicitamente a secret que será usada para assinar tokens
  // O NextAuth, por padrão, usa process.env.NEXTAUTH_SECRET.
  // Agora ele vai usar exatamente a mesma variável que usaremos no proxy.ts
  secret: process.env.NEXTAUTH_SECRET,

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
      },

      async authorize(credentials, request) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const ip =
          request?.headers?.get('x-forwarded-for')?.split(',')[0] ??
          '127.0.0.1';

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