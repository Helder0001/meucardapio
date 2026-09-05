'use client'
// components/shared/analytics-consent.tsx
//
// Banner de cookies (LGPD) + Google Analytics amarrados: o GA só carrega
// DEPOIS que a pessoa aceita — analytics antes do consentimento seria
// coletar dado pessoal (IP, comportamento de navegação) sem base legal.
// Precisa da env var NEXT_PUBLIC_GA_MEASUREMENT_ID (formato G-XXXXXXXXXX,
// em Google Analytics → Admin → Fluxos de dados → seu site → ID de
// métricas). Sem essa env var, o banner nem aparece (nada pra rastrear).

import { useEffect, useState } from 'react'
import Script from 'next/script'
import Link from 'next/link'
import { Cookie } from 'lucide-react'

const CONSENT_KEY = 'cookie-consent' // 'accepted' | 'rejected'

export function AnalyticsConsent() {
  const [consent, setConsent] = useState<'accepted' | 'rejected' | null>(null)
  const [showBanner, setShowBanner] = useState(false)
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

  useEffect(() => {
    const stored = window.localStorage.getItem(CONSENT_KEY)
    if (stored === 'accepted' || stored === 'rejected') {
      setConsent(stored)
    } else if (gaId) {
      // Só mostra o banner se houver algo pra de fato rastrear — sem GA
      // configurado, não tem cookie de analytics, não precisa perguntar.
      setShowBanner(true)
    }
  }, [gaId])

  function decide(choice: 'accepted' | 'rejected') {
    window.localStorage.setItem(CONSENT_KEY, choice)
    setConsent(choice)
    setShowBanner(false)
  }

  return (
    <>
      {gaId && consent === 'accepted' && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" />
          <Script id="ga-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${gaId}', { anonymize_ip: true });
            `}
          </Script>
        </>
      )}

      {showBanner && (
        <div className="fixed bottom-0 inset-x-0 z-[100] p-4 sm:p-5">
          <div className="max-w-2xl mx-auto bg-card border border-border rounded-2xl shadow-lg p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Cookie className="h-6 w-6 text-orange-500 flex-shrink-0 hidden sm:block" />
            <p className="text-sm text-foreground flex-1">
              Usamos cookies para melhorar sua experiência e entender como você usa o site.
              Veja nossa{' '}
              <Link href="/privacidade" className="underline hover:text-primary">
                Política de Privacidade
              </Link>.
            </p>
            <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
              <button
                onClick={() => decide('rejected')}
                className="flex-1 sm:flex-none px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors"
              >
                Recusar
              </button>
              <button
                onClick={() => decide('accepted')}
                className="flex-1 sm:flex-none px-4 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                Aceitar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
