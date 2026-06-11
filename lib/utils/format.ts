// lib/utils/format.ts
// Formatadores de dados para exibição na UI

import { format, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// Formatar valor monetário em Real brasileiro
// formatCurrency(29.9) → "R$ 29,90"
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

// Formatar data e hora
// formatDate(new Date()) → "31/12/2024, 23:59"
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return format(d, "dd/MM/yyyy, HH:mm", { locale: ptBR })
}

// Formatar apenas hora
// formatTime(new Date()) → "23:59"
export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return format(d, 'HH:mm', { locale: ptBR })
}

// Tempo relativo
// formatRelative(new Date()) → "há 5 minutos"
export function formatRelative(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return formatDistanceToNow(d, { locale: ptBR, addSuffix: true })
}

// Formatar telefone
// formatPhone("5511999999999") → "+55 (11) 99999-9999"
export function formatPhone(phone: string): string {
  const clean = phone.replace(/\D/g, '')
  if (clean.length === 13) {
    return `+${clean.slice(0, 2)} (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`
  }
  if (clean.length === 11) {
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`
  }
  return phone
}

// Formatar CNPJ
// formatCNPJ("12345678000195") → "12.345.678/0001-95"
export function formatCNPJ(cnpj: string): string {
  const clean = cnpj.replace(/\D/g, '')
  return clean.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    '$1.$2.$3/$4-$5'
  )
}

// Formatar número de pedido
// formatOrderNumber(42) → "#0042"
export function formatOrderNumber(n: number): string {
  return `#${String(n).padStart(4, '0')}`
}
