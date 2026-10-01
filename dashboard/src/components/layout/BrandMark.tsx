import { useId } from 'react'
import { cn } from '@/lib/utils'

type BrandMarkProps = { className?: string; decorative?: boolean }

/** Two opposing lanes: the request and its response, held in a glass tile. */
export function BrandMark({ className, decorative = false }: BrandMarkProps) {
  const id = useId().replace(/:/g, '')
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" fill="none"
      className={cn('brand-mark block shrink-0', className)}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : 'Backchannel'}
      aria-hidden={decorative ? true : undefined} focusable="false"
    >
      <defs>
        <linearGradient id={'brand-glass-' + id} x1="16" y1="12" x2="80" y2="90" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2d5946" /><stop offset=".52" stopColor="#142e23" /><stop offset="1" stopColor="#0a1711" />
        </linearGradient>
        <linearGradient id={'brand-edge-' + id} x1="12" y1="10" x2="80" y2="92" gradientUnits="userSpaceOnUse">
          <stop stopColor="#b5ffdc" stopOpacity=".48" /><stop offset=".48" stopColor="#80e4b6" stopOpacity=".1" /><stop offset="1" stopColor="#85e6ca" stopOpacity=".28" />
        </linearGradient>
        <linearGradient id={'brand-sheen-' + id}>
          <stop stopColor="#d9ffeb" stopOpacity="0" /><stop offset=".5" stopColor="#d9ffeb" stopOpacity=".22" /><stop offset="1" stopColor="#d9ffeb" stopOpacity="0" />
        </linearGradient>
        <clipPath id={'brand-clip-' + id}>
          <rect x="10" y="10" width="76" height="76" rx="24" />
        </clipPath>
      </defs>
      <rect x="10" y="10" width="76" height="76" rx="24" fill={'url(#brand-glass-' + id + ')'} stroke={'url(#brand-edge-' + id + ')'} strokeWidth="1.5" />
      <rect x="13" y="13" width="70" height="70" rx="21" stroke="#d9ffeb" strokeOpacity=".045" />
      <path d="M34 14h28a20 20 0 0 1 14 5" stroke="#daffec" strokeOpacity=".12" strokeWidth="1.5" strokeLinecap="round" />
      <g clipPath={'url(#brand-clip-' + id + ')'}>
        <g className="brand-sheen" opacity="0">
          <path d="m-52-10 35-12L35 106 0 118Z" fill={'url(#brand-sheen-' + id + ')'} />
        </g>
      </g>
      <rect className="brand-edge-trace" x="10" y="10" width="76" height="76" rx="24" pathLength="100" stroke="#baffdc" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="18 82" opacity="0" />
      <g strokeLinecap="round" strokeLinejoin="round">
        <path className="brand-lane" pathLength="100" d="M28 37h38m-9-9 9 9-9 9" stroke="#c9ffe4" strokeWidth="4.2" />
        <path className="brand-lane brand-lane-return" pathLength="100" d="M68 59H30m9-9-9 9 9 9" stroke="#6ce8b0" strokeWidth="4.2" />
        <path className="brand-packet" d="M28 37h38" pathLength="100" stroke="#f1fff7" strokeWidth="4.2" strokeDasharray="22 120" strokeDashoffset="25" opacity="0" />
        <path className="brand-packet brand-packet-return" d="M68 59H30" pathLength="100" stroke="#d1ffeb" strokeWidth="4.2" strokeDasharray="22 120" strokeDashoffset="25" opacity="0" />
        <path className="brand-tip" d="m57 28 9 9-9 9" stroke="#f1fff7" strokeWidth="4.2" opacity="0" />
        <path className="brand-tip brand-tip-return" d="m39 50-9 9 9 9" stroke="#d1ffeb" strokeWidth="4.2" opacity="0" />
      </g>
    </svg>
  )
}
