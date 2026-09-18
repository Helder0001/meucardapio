'use client'

// lib/i18n/dashboard-context.tsx
import { createI18nScope } from './create-scope'
import type { DashboardDict } from './dashboard'

const scope = createI18nScope<DashboardDict>()

export const DashboardI18nProvider = scope.I18nProvider
export const useDashboardDict = scope.useDict
export const useDashboardLocale = scope.useLocale
