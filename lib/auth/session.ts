// lib/auth/session.ts
//
// Centraliza a exportação do auth() do NextAuth.
// Importar sempre daqui, nunca direto do next-auth.

import NextAuth from 'next-auth'
import { authConfig } from './config'

export const { auth, signIn, signOut, handlers } = NextAuth(authConfig)
