import { useEffect, useMemo, useRef, useState } from 'react'

import type { FlowSummary } from '@/lib/types'

export type WebSocketConnectionState = 'connected' | 'reconnecting' | 'disconnected'

export type FlowStreamFilters = {
  url_contains?: string
  method?: string
  status_min?: number
  status_max?: number
}

type UseWebSocketOptions = {
  token: string
  filters: FlowStreamFilters
  onFlow: (flow: FlowSummary) => void
}

const MAX_RECONNECT_DELAY_MS = 30_000
const MIN_FALLBACK_DELAY_MS = 30_000
const FALLBACK_RETRY_DELAY_MS = 5_000

export function getReconnectDelayMs(attempt: number, firstFailureAt: number | null, now: number): number | null {
  const elapsedMs = firstFailureAt === null ? 0 : Math.max(0, now - firstFailureAt)
  if (firstFailureAt !== null && elapsedMs >= MIN_FALLBACK_DELAY_MS) {
    return null
  }
  const backoffDelayMs = Math.min(1000 * (2 ** Math.max(0, attempt - 1)), MAX_RECONNECT_DELAY_MS)
  if (firstFailureAt === null) {
    return backoffDelayMs
  }
  const remainingMs = Math.max(0, MIN_FALLBACK_DELAY_MS - elapsedMs)
  return Math.min(backoffDelayMs, remainingMs)
}

function getWebSocketUrl(token: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`
}

export function useWebSocket({ token, filters, onFlow }: UseWebSocketOptions) {
  const [connectionState, setConnectionState] = useState<WebSocketConnectionState>('disconnected')
  const [fallbackToPolling, setFallbackToPolling] = useState(false)
  const socketRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const shouldRunRef = useRef(true)
  const onFlowRef = useRef(onFlow)
  const subscribePayloadRef = useRef('')
  const firstFailureAtRef = useRef<number | null>(null)

  useEffect(() => {
    onFlowRef.current = onFlow
  }, [onFlow])

  const subscribePayload = useMemo(
    () => JSON.stringify({ action: 'subscribe', filters }),
    [filters]
  )

  useEffect(() => {
    subscribePayloadRef.current = subscribePayload
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return
    }
    socket.send(subscribePayloadRef.current)
  }, [subscribePayload])

  useEffect(() => {
    shouldRunRef.current = true
    reconnectAttemptsRef.current = 0
    firstFailureAtRef.current = null

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
    }

    const closeSocket = () => {
      const socket = socketRef.current
      socketRef.current = null
      if (!socket) {
        return
      }
      try {
        socket.onclose = null
        socket.onerror = null
        socket.onmessage = null
        socket.onopen = null
        socket.close()
      } catch {
      }
    }

    const scheduleReconnect = () => {
      reconnectAttemptsRef.current += 1
      const now = Date.now()
      if (firstFailureAtRef.current === null) {
        firstFailureAtRef.current = now
      }
      const delayMs = getReconnectDelayMs(reconnectAttemptsRef.current, firstFailureAtRef.current, now)
      if (delayMs === null) {
        setConnectionState('disconnected')
        setFallbackToPolling(true)
        reconnectTimerRef.current = window.setTimeout(() => {
          reconnectTimerRef.current = null
          reconnectAttemptsRef.current = 0
          firstFailureAtRef.current = null
          connect()
        }, FALLBACK_RETRY_DELAY_MS)
        return
      }
      setConnectionState('reconnecting')
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null
        connect()
      }, delayMs)
    }

    const connect = () => {
      clearReconnectTimer()
      closeSocket()
      if (!token) {
        setConnectionState('disconnected')
        setFallbackToPolling(true)
        return
      }
      let socket: WebSocket
      try {
        socket = new WebSocket(getWebSocketUrl(token))
      } catch {
        scheduleReconnect()
        return
      }
      socketRef.current = socket
      socket.onopen = () => {
        reconnectAttemptsRef.current = 0
        firstFailureAtRef.current = null
        setConnectionState('connected')
        setFallbackToPolling(false)
        socket.send(subscribePayloadRef.current)
      }
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          if (message?.type === 'flow' && message.data) {
            onFlowRef.current(message.data as FlowSummary)
          }
        } catch {
        }
      }
      socket.onerror = () => {
        try {
          socket.close()
        } catch {
        }
      }
      socket.onclose = () => {
        if (!shouldRunRef.current) {
          return
        }
        scheduleReconnect()
      }
    }

    connect()

    return () => {
      shouldRunRef.current = false
      clearReconnectTimer()
      closeSocket()
    }
  }, [token])

  return {
    connectionState,
    fallbackToPolling,
  }
}
