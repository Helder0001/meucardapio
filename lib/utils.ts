// lib/utils.ts
// Funções utilitárias globais

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// cn(): mescla classes Tailwind de forma segura (resolve conflitos)
// Uso: cn('px-4 py-2', isActive && 'bg-blue-500', className)
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
