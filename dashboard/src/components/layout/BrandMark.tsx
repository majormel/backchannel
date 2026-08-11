import { useId } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

import { cn } from '@/lib/utils'

type BrandMarkProps = {
  className?: string
  decorative?: boolean
}

const NAVY = '#1B2A3F'
const COBALT = '#2F6BFF'
const AQUA = '#4ED9E4'
const SILVER = '#C9D6E4'
const PALE = '#EAF6FF'

const INCOMING: { x: number; y: number; width: number; opacity: number }[] = [
  { x: 6, y: 32.4, width: 9, opacity: 0.42 },
  { x: 18, y: 33.6, width: 5, opacity: 0.3 },
  { x: 4, y: 42.4, width: 6, opacity: 0.5 },
  { x: 13, y: 42.4, width: 8, opacity: 0.38 },
  { x: 24, y: 42.4, width: 4, opacity: 0.28 },
  { x: 7, y: 53.2, width: 7, opacity: 0.4 },
  { x: 17, y: 54.4, width: 9, opacity: 0.3 },
]

const FOCUSED: { y: number; x1: number; x2: number; main?: boolean }[] = [
  { y: 34, x1: 28, x2: 66 },
  { y: 44, x1: 26, x2: 72, main: true },
  { y: 54, x1: 28, x2: 64 },
]

const PACKETS: { y: number; fill: string; duration: number; delay: number }[] = [
  { y: 42.4, fill: PALE, duration: 2.8, delay: 0.9 },
  { y: 32.4, fill: AQUA, duration: 3.6, delay: 1.7 },
]

export function BrandMark({ className, decorative = false }: BrandMarkProps) {
  const reducedMotion = useReducedMotion() ?? false
  const idSuffix = useId().replace(/:/g, '')
  const ringGradientId = `lens-ring-${idSuffix}`
  const streamGradientId = `lens-stream-${idSuffix}`
  const glowGradientId = `lens-glow-${idSuffix}`
  const clipId = `lens-clip-${idSuffix}`

  return (
    <motion.svg
      viewBox="0 0 96 96"
      className={cn('brand-mark block shrink-0 overflow-visible', className)}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : 'Backchannel'}
      aria-hidden={decorative ? true : undefined}
      initial={reducedMotion ? false : { opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <defs>
        <linearGradient id={ringGradientId} x1="30" y1="20" x2="76" y2="68" gradientUnits="userSpaceOnUse">
          <stop stopColor="#273B54" />
          <stop offset="1" stopColor="#121D2D" />
        </linearGradient>
        <linearGradient id={streamGradientId} x1="26" y1="44" x2="74" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor={COBALT} />
          <stop offset="1" stopColor={AQUA} />
        </linearGradient>
        <radialGradient id={glowGradientId} cx="50%" cy="50%" r="50%">
          <stop stopColor={COBALT} stopOpacity="0.16" />
          <stop offset="0.65" stopColor={COBALT} stopOpacity="0.05" />
          <stop offset="1" stopColor={COBALT} stopOpacity="0" />
        </radialGradient>
        <clipPath id={clipId}>
          <circle cx="52" cy="44" r="20" />
        </clipPath>
      </defs>

      <circle cx="52" cy="44" r="32" fill={`url(#${glowGradientId})`} />

      <motion.line
        x1="70"
        y1="62"
        x2="82"
        y2="74"
        stroke={NAVY}
        strokeWidth="9"
        strokeLinecap="round"
        initial={reducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.4 }}
      />

      {INCOMING.map((fragment, index) => (
        <motion.rect
          key={`in-${index}`}
          x={fragment.x}
          y={fragment.y}
          width={fragment.width}
          height="3.2"
          rx="1.6"
          fill={SILVER}
          initial={reducedMotion ? false : { x: -7, opacity: 0 }}
          animate={{ x: 0, opacity: fragment.opacity }}
          transition={{ delay: 0.32 + index * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}

      <g clipPath={`url(#${clipId})`}>
        {FOCUSED.map((stream, index) => (
          <motion.line
            key={`focus-${index}`}
            x1={stream.x1}
            y1={stream.y}
            x2={stream.x2}
            y2={stream.y}
            stroke={stream.main ? `url(#${streamGradientId})` : COBALT}
            strokeWidth={stream.main ? 3.6 : 3.2}
            strokeLinecap="round"
            strokeOpacity={stream.main ? 1 : 0.72}
            initial={reducedMotion ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ delay: 0.5 + index * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
        {!reducedMotion
          ? PACKETS.map((packet, index) => (
              <motion.rect
                key={`packet-${index}`}
                y={packet.y}
                width="6"
                height="3.2"
                rx="1.6"
                fill={packet.fill}
                initial={{ x: 28, opacity: 0 }}
                animate={{ x: [28, 72], opacity: [0, 1, 1, 0] }}
                transition={{ duration: packet.duration, delay: packet.delay, repeat: Infinity, ease: 'linear', times: [0, 0.18, 0.82, 1] }}
              />
            ))
          : null}
      </g>

      <motion.circle
        cx="52"
        cy="44"
        r="24"
        fill="none"
        stroke={`url(#${ringGradientId})`}
        strokeWidth="7"
        initial={reducedMotion ? false : { pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.path
        d="M 28.4 48.2 A 24 24 0 0 1 49.9 20.1"
        fill="none"
        stroke={AQUA}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeOpacity="0.6"
        initial={reducedMotion ? false : { pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 0.6 }}
        transition={{ delay: 0.55, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.path
        d="M 37 38.5 A 16 16 0 0 1 67 38.5"
        fill="none"
        stroke={AQUA}
        strokeWidth="1.8"
        strokeLinecap="round"
        initial={reducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 0.28 }}
        transition={{ delay: 0.7, duration: 0.4 }}
      />
      <motion.path
        d="M 67 49.5 A 16 16 0 0 1 39.7 54.3"
        fill="none"
        stroke={AQUA}
        strokeWidth="1.8"
        strokeLinecap="round"
        initial={reducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 0.22 }}
        transition={{ delay: 0.76, duration: 0.4 }}
      />

      <motion.circle
        cx="52"
        cy="44"
        r="4"
        fill={AQUA}
        initial={reducedMotion ? false : { scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 0.28 }}
        transition={{ delay: 0.72, type: 'spring', stiffness: 260, damping: 16 }}
        style={{ transformOrigin: '52px 44px' }}
      />
      <motion.circle
        cx="52"
        cy="44"
        r="2.1"
        fill={PALE}
        initial={reducedMotion ? false : { scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 0.95 }}
        transition={{ delay: 0.78, type: 'spring', stiffness: 300, damping: 15 }}
        style={{ transformOrigin: '52px 44px' }}
      />
    </motion.svg>
  )
}
