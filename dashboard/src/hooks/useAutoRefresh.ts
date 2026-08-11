import { useEffect, useRef } from 'react'

export function useAutoRefresh(enabled: boolean, intervalSeconds: number, callback: () => void): void {
  const callbackRef = useRef(callback)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    if (!enabled) return

    const interval = Math.max(1, intervalSeconds) * 1000
    const timer = setInterval(() => {
      callbackRef.current()
    }, interval)

    return () => clearInterval(timer)
  }, [enabled, intervalSeconds])
}
