'use client'

import { signOut } from 'next-auth/react'

export function SignOutLink() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/login' })}
      className="text-sm text-neutral-500 hover:text-neutral-700 underline"
    >
      Sair e entrar com outra conta
    </button>
  )
}
