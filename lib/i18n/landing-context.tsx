'use client'

// lib/i18n/landing-context.tsx
import { createI18nScope } from './create-scope'
import type { LandingDict } from './landing'

const scope = createI18nScope<LandingDict>()

export const LandingI18nProvider = scope.I18nProvider
export const useLandingDict = scope.useDict
export const useLandingLocale = scope.useLocale
