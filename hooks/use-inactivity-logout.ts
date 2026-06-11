'use client'
// hooks/use-inactivity-logout.ts

import { useEffect, useRef, useCallback, useState } from 'react'
import { signOut } from 'next-auth/react'

const INACTIVE_TIMEOUT  = 30 * 60 * 1000
const WARNING_BEFORE    =  2 * 60 * 1000

export function useInactivityLogout() {
  const [showWarning, setShowWarning] = useState(false)
  const [countdown,   setCountdown]   = useState(120)
  const logoutTimer  = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const warningTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const countdownRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const clearTimers = () => {
    clearTimeout(logoutTimer.current)
    clearTimeout(warningTimer.current)
    clearInterval(countdownRef.current)
  }

  const doLogout = useCallback(async () => {
    clearTimers()
    await signOut({ callbackUrl: '/login?reason=inactivity' })
  }, [])

  const resetTimers = useCallback(() => {
    clearTimers()
    setShowWarning(false)
    setCountdown(120)
    warningTimer.current = setTimeout(() => {
      setShowWarning(true)
      setCountdown(120)
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownRef.current)
            return 0
          }
          return prev - 1
        })
      }, 1_000)
    }, INACTIVE_TIMEOUT - WARNING_BEFORE)
    logoutTimer.current = setTimeout(doLogout, INACTIVE_TIMEOUT)
  }, [doLogout])

  useEffect(() => {
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
    const handler = () => resetTimers()
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }))
    resetTimers()
    return () => {
      events.forEach((e) => window.removeEventListener(e, handler))
      clearTimers()
    }
  }, [resetTimers])

  const stayLoggedIn = () => {
    clearTimers()
    resetTimers()
  }

  return { showWarning, countdown, stayLoggedIn, doLogout }
}