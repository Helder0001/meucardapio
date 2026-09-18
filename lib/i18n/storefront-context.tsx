'use client'

// lib/i18n/storefront-context.tsx
import { createI18nScope } from './create-scope'
import type { StorefrontDict } from './storefront'

const scope = createI18nScope<StorefrontDict>()

export const StorefrontI18nProvider = scope.I18nProvider
export const useStorefrontDict = scope.useDict
export const useStorefrontLocale = scope.useLocale
