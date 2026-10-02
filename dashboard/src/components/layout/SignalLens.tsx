import { useId } from 'react'
import { cn } from '@/lib/utils'

/** A decorative packet lens; its motion is independent of capture activity. */
export function SignalLens({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <div className={cn('signal-lens', className)} aria-hidden="true">
      <svg viewBox="0 0 360 360" fill="none">
        <defs>
          <radialGradient id={`lens-fill-${id}`} cx="30%" cy="20%" r="85%">
            <stop stopColor="#a3ffd0" stopOpacity=".12" />
            <stop offset=".5" stopColor="#66ffd3" stopOpacity=".035" />
            <stop offset="1" stopColor="#07130e" stopOpacity=".5" />
          </radialGradient>
          <linearGradient id={`lens-edge-${id}`} x1="100" y1="70" x2="260" y2="290" gradientUnits="userSpaceOnUse">
            <stop stopColor="#c7ffe0" stopOpacity=".7" />
            <stop offset=".45" stopColor="#8affc4" stopOpacity=".08" />
            <stop offset="1" stopColor="#74ebd7" stopOpacity=".4" />
          </linearGradient>
        </defs>
        <path d="M0 180H360M180 0V360" stroke="currentColor" strokeOpacity=".08" strokeDasharray="3 6" />
        <circle cx="180" cy="180" r="154" stroke="currentColor" strokeOpacity=".1" />
        <circle cx="180" cy="180" r="136" stroke="currentColor" strokeOpacity=".16" strokeDasharray="1 9" />
        <g className="signal-orbit">
          <path d="M180 26a154 154 0 0 1 154 154" stroke="currentColor" strokeOpacity=".6" strokeLinecap="round" />
          <circle cx="180" cy="26" r="3" fill="currentColor" />
          <circle cx="180" cy="334" r="2" fill="currentColor" fillOpacity=".4" />
        </g>
        <circle cx="180" cy="180" r="108" fill={`url(#lens-fill-${id})`} stroke={`url(#lens-edge-${id})`} />
        <ellipse cx="180" cy="180" rx="60" ry="108" stroke="currentColor" strokeOpacity=".12" />
        <ellipse cx="180" cy="180" rx="26" ry="108" stroke="currentColor" strokeOpacity=".1" />
        <ellipse cx="180" cy="180" rx="108" ry="60" stroke="currentColor" strokeOpacity=".12" />
        <ellipse cx="180" cy="180" rx="108" ry="26" stroke="currentColor" strokeOpacity=".1" />
        <path d="M72 180h216M180 72v216" stroke="currentColor" strokeOpacity=".12" />
        <rect x="140" y="140" width="80" height="80" rx="24" fill="#10231b" fillOpacity=".9" stroke={`url(#lens-edge-${id})`} />
        <path d="m159 164 15 16-15 16M181 196h20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path className="signal-packet" d="M20 180h24M310 180h24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M36 66v-10h10M314 56h10v10M36 294v10h10M314 304h10v-10" stroke="currentColor" strokeOpacity=".3" />
      </svg>
    </div>
  )
}
