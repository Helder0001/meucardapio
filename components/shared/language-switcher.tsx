'use client'

// components/shared/language-switcher.tsx
//
// Seletor de idioma genérico — usado nos 3 escopos independentes
// (dashboard, storefront, landing), cada um passando sua própria lista de
// idiomas e sua própria server action (ver actions/i18n/set-locale.ts).
// Ao escolher: chama a action (grava só o cookie daquele escopo) e faz
// router.refresh() pra re-renderizar a árvore com o dicionário novo — sem
// isso o Provider (que recebe o dict via props do Server Component pai)
// não saberia que o cookie mudou.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LocaleOption { code: string; label: string; flag: string }

interface LanguageSwitcherProps {
  locales: LocaleOption[]
  currentLocale: string
  onChange: (locale: string) => Promise<void>
  label: string
  variant?: 'light' | 'dark'
}

export function LanguageSwitcher({ locales, currentLocale, onChange, label, variant = 'light' }: LanguageSwitcherProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const current = locales.find((l) => l.code === currentLocale) ?? locales[0]
  const isDark = variant === 'dark'

  const handleSelect = (code: string) => {
    setOpen(false)
    if (code === currentLocale) return
    startTransition(async () => {
      await onChange(code)
      router.refresh()
    })
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        aria-label={label}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-50 border',
          isDark
            ? 'text-white/80 border-white/15 hover:bg-white/10'
            : 'text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
        )}
      >
        <span>{current.flag}</span>
        <span>{current.code.split('-')[0].toUpperCase()}</span>
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-50 min-w-[9rem] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg py-1">
            <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
            {locales.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => handleSelect(l.code)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 text-left text-gray-700 dark:text-gray-200"
              >
                <span>{l.flag}</span>
                <span className="flex-1">{l.label}</span>
                {l.code === currentLocale && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
