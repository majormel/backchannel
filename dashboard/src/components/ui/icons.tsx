import { forwardRef, type ReactNode, type SVGProps } from 'react'

export type IconProps = SVGProps<SVGSVGElement> & { size?: number | string }

/**
 * Backchannel glyphs: a 24 px grid, 1.8 px strokes, open corners and quiet
 * secondary planes. Inherit color so selected, disabled and error states work
 * everywhere without baking a palette into an individual icon.
 */
function glyph(name: string, drawing: ReactNode) {
  const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon(
    { size = 24, className = '', strokeWidth = 1.8, children, ...props }, ref,
  ) {
    const labelled = Boolean(props['aria-label'] || props['aria-labelledby'])
    return (
      <svg
        ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
        width={size} height={size} fill="none" stroke="currentColor"
        strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
        className={'app-icon ' + className} data-icon={name}
        aria-hidden={labelled ? undefined : true} role={labelled ? 'img' : undefined}
        focusable="false" {...props}
      >{drawing}{children}</svg>
    )
  })
  Icon.displayName = name
  return Icon
}

// Navigation and traffic.
export const Activity = glyph('capture', <>
  <path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3" opacity=".45" />
  <path d="M5 12h4l2-5 3 10 2-5h3" />
</>)
export const Flows = glyph('flows', <>
  <path d="M5 12h3c4 0 3-6 7-6h4M8 12c4 0 3 6 7 6h4" />
  <rect x="2.5" y="9.5" width="5" height="5" rx="1.5" fill="currentColor" fillOpacity=".1" />
  <path d="m17 4 2 2-2 2m0 8 2 2-2 2" />
</>)
export const Search = glyph('search', <>
  <circle cx="10.5" cy="10.5" r="6.5" fill="currentColor" fillOpacity=".04" />
  <path d="m15.5 15.5 5 5M8 7.5a3.5 3.5 0 0 1 2.5-1" opacity=".65" />
</>)
export const GitCompare = glyph('compare', <>
  <rect x="2.5" y="4" width="7" height="16" rx="2" fill="currentColor" fillOpacity=".05" />
  <rect x="14.5" y="4" width="7" height="16" rx="2" fill="currentColor" fillOpacity=".1" />
  <path d="M5.5 8h1m11 8h1" opacity=".6" />
</>)
export const Workflow = glyph('sequence', <>
  <path d="M3 3v18M21 3v18" opacity=".4" />
  <path className="icon-sequence-out" d="M6 7h11m-3-3 3 3-3 3" />
  <path className="icon-sequence-return" d="M18 17H7m3-3-3 3 3 3" />
</>)
export const Replay = glyph('replay', <>
  <path d="M4 9a8.5 8.5 0 1 1 .5 7M4 4.5V9h4.5" />
  <path d="m10 8.5 5.5 3.5-5.5 3.5Z" fill="currentColor" stroke="none" />
</>)
export const Bot = glyph('agents', <>
  <rect x="4" y="6" width="16" height="14" rx="4" fill="currentColor" fillOpacity=".06" />
  <path d="M12 3v3M1.5 11v4m21-4v4" opacity=".5" />
  <path d="m8 10 2 2-2 2m5 1h3" />
</>)
export const Bug = glyph('instrument', <>
  <rect x="6.5" y="5.5" width="11" height="14" rx="4" fill="currentColor" fillOpacity=".06" />
  <path d="m9 5-2-2m8 2 2-2M3 9h3m12 0h3M3 15h3m12 0h3m-15 4-2 2m14-2 2 2" opacity=".55" />
  <path d="M12 9v7m-2-4 2-3 2 3" />
</>)
export const Settings = glyph('settings', <>
  <path d="M5 4v16m7-16v16m7-16v16" opacity=".38" />
  <rect x="2.5" y="7" width="5" height="4" rx="1.3" fill="currentColor" fillOpacity=".1" />
  <rect x="9.5" y="14" width="5" height="4" rx="1.3" fill="currentColor" fillOpacity=".1" />
  <rect x="16.5" y="5" width="5" height="4" rx="1.3" fill="currentColor" fillOpacity=".1" />
</>)
export const Cable = glyph('connect', <>
  <path d="M8 4H6a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h2m8-16h2a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-2" opacity=".5" />
  <path className="icon-signal" pathLength="1" d="M8 12h8m-3-3 3 3-3 3" />
</>)
export const Terminal = glyph('terminal', <>
  <rect x="3" y="4" width="18" height="16" rx="3" fill="currentColor" fillOpacity=".035" opacity=".55" />
  <path d="m7 9 3 3-3 3m6 0h4" />
</>)

// Direction and small controls stay deliberately spare.
export const ArrowRight = glyph('arrow-right', <path d="M4 12h15m-6-6 6 6-6 6" />)
export const ArrowLeft = glyph('arrow-left', <path d="M20 12H5m6-6-6 6 6 6" />)
export const ArrowUp = glyph('arrow-up', <path d="M12 20V5m-6 6 6-6 6 6" />)
export const ArrowDown = glyph('arrow-down', <path d="M12 4v15m-6-6 6 6 6-6" />)
export const ArrowUpRight = glyph('arrow-up-right', <path d="M6 18 18 6M7 6h11v11" />)
export const ArrowDownLeft = glyph('arrow-down-left', <path d="M18 6 6 18M6 7v11h11" />)
export const ArrowUpDown = glyph('sort', <><path d="M8 19V5m-3 3 3-3 3 3" /><path d="M16 5v14m-3-3 3 3 3-3" opacity=".55" /></>)
export const ChevronRight = glyph('chevron-right', <path d="m9 5 7 7-7 7" />)
export const ChevronDown = glyph('chevron-down', <path d="m5 9 7 7 7-7" />)
export const ChevronUp = glyph('chevron-up', <path d="m5 15 7-7 7 7" />)
export const X = glyph('close', <path d="m6 6 12 12M18 6 6 18" />)
export const Check = glyph('check', <path d="m4.5 12.5 5 5 10-11" />)
export const Play = glyph('play', <path d="M7 4.8a.8.8 0 0 1 1.2-.7l11 7.2a.8.8 0 0 1 0 1.4l-11 7.2a.8.8 0 0 1-1.2-.7Z" fill="currentColor" fillOpacity=".1" />)
export const Square = glyph('stop', <rect x="5" y="5" width="14" height="14" rx="3" fill="currentColor" fillOpacity=".14" />)
export const Loader2 = glyph('loading', <><circle cx="12" cy="12" r="8" opacity=".16" /><path d="M12 4a8 8 0 0 1 8 8" strokeWidth="2.2" /></>)
export const RefreshCw = glyph('refresh', <><path d="M4 10a8 8 0 0 1 13.5-3.7L20 9m0-5v5h-5" /><path d="M20 14a8 8 0 0 1-13.5 3.7L4 15m0 5v-5h5" opacity=".6" /></>)
export const ExternalLink = glyph('external-link', <><path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" opacity=".5" /><path d="M14 3h7v7M10 14 21 3" /></>)

// Devices and transport.
export const Smartphone = glyph('phone', <><rect x="6.5" y="2.5" width="11" height="19" rx="3" fill="currentColor" fillOpacity=".04" /><path d="M10 5h4" opacity=".4" /><path d="M11 18.5h2" /></>)
export const Monitor = glyph('monitor', <><rect x="3" y="3.5" width="18" height="13" rx="2.5" fill="currentColor" fillOpacity=".04" /><path d="M8 21h8m-4-4v4" opacity=".6" /><path d="M7 13h10" opacity=".25" /></>)
export const Laptop2 = glyph('laptop', <><path d="M5 16V5.5A1.5 1.5 0 0 1 6.5 4h11A1.5 1.5 0 0 1 19 5.5V16" fill="currentColor" fillOpacity=".04" /><path d="M2.5 17h19l-1 3h-17Z" opacity=".65" /><path d="M10 17h4" /></>)
export const MonitorSmartphone = glyph('devices', <><path d="M11 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v2M6 21h5m-3-4v4" opacity=".55" /><rect x="14" y="9" width="8" height="13" rx="2" fill="currentColor" fillOpacity=".05" /><path d="M17 19h2" /></>)
export const Network = glyph('network', <><path d="M12 8v5m-6 3v-3h12v3" opacity=".5" /><rect x="9" y="2" width="6" height="6" rx="1.5" fill="currentColor" fillOpacity=".08" /><rect x="3" y="16" width="6" height="6" rx="1.5" /><rect x="15" y="16" width="6" height="6" rx="1.5" /></>)
export const Router = glyph('router', <><rect x="3" y="13" width="18" height="7" rx="2" fill="currentColor" fillOpacity=".05" /><path d="M6 13V6m12 7V6M9 6a4 4 0 0 1 6 0M7 3a7 7 0 0 1 10 0" opacity=".5" /><path d="M7 16.5h.01m4 0h.01m4 0h2" /></>)
export const Wifi = glyph('wifi', <><path d="M2.5 8a14 14 0 0 1 19 0" opacity=".4" /><path d="M6 12a9 9 0 0 1 12 0" opacity=".7" /><path d="M9.5 16a4 4 0 0 1 5 0" /><circle cx="12" cy="20" r="1" fill="currentColor" stroke="none" /></>)
export const Radio = glyph('radio', <><path d="M5 4a11 11 0 0 0 0 16m14-16a11 11 0 0 1 0 16" opacity=".35" /><path d="M8 7a7 7 0 0 0 0 10m8-10a7 7 0 0 1 0 10" opacity=".7" /><circle cx="12" cy="12" r="2" fill="currentColor" fillOpacity=".2" /></>)
export const Globe = glyph('globe', <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z" opacity=".45" /></>)
export const Globe2 = Globe
export const Waves = glyph('traffic-waves', <><path d="M3 7c3-4 6 4 9 0s6 4 9 0" opacity=".4" /><path d="M3 12c3-4 6 4 9 0s6 4 9 0" /><path d="M3 17c3-4 6 4 9 0s6 4 9 0" opacity=".4" /></>)
export const Unplug = glyph('disconnect', <><path d="m9 9-3 3a4.2 4.2 0 0 0 6 6l3-3M15 15l3-3a4.2 4.2 0 0 0-6-6L9 9" opacity=".5" /><path d="m3 3 18 18M4 20l2-2m12-12 2-2" /></>)
export const QrCode = glyph('qr-code', <><path d="M3 8V3h5m8 0h5v5M3 16v5h5m8 0h5v-5" opacity=".4" /><path d="M6 6h3v3H6Zm9 0h3v3h-3ZM6 15h3v3H6Z" fill="currentColor" fillOpacity=".15" /><path d="M13 13h4v4h-4m4-4h3m-7 4v3m4 0h3v-3" /></>)
export const Cpu = glyph('cpu', <><path d="M8 2v3m8-3v3M8 19v3m8-3v3M2 8h3m-3 8h3m14-8h3m-3 8h3" opacity=".45" /><rect x="5" y="5" width="14" height="14" rx="3" fill="currentColor" fillOpacity=".04" /><rect x="9" y="9" width="6" height="6" rx="1" opacity=".75" /></>)
export const MemoryStick = glyph('memory', <><rect x="2.5" y="5" width="19" height="12" rx="2" fill="currentColor" fillOpacity=".04" /><path d="M6 17v3m4-3v3m4-3v3m4-3v3" opacity=".5" /><path d="M6 9h4v4H6Zm8 0h4v4h-4Z" /></>)
export const Keyboard = glyph('keyboard', <><rect x="2" y="5" width="20" height="14" rx="3" fill="currentColor" fillOpacity=".04" /><path d="M6 9h.01m4 0h.01m4 0h.01m4 0h.01M6 12h.01m4 0h.01m4 0h.01m4 0h.01M7 15.5h10" strokeWidth="2" /></>)

// Files, organization and actions.
export const Copy = glyph('copy', <><path d="M8 6V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" opacity=".4" /><rect x="3" y="7" width="13" height="15" rx="2.5" fill="currentColor" fillOpacity=".04" /></>)
export const Download = glyph('download', <><path d="M4 16v4h16v-4" opacity=".5" /><path d="M12 3v12m-5-5 5 5 5-5" /></>)
export const Upload = glyph('upload', <><path d="M4 16v4h16v-4" opacity=".5" /><path d="M12 15V3m-5 5 5-5 5 5" /></>)
export const FileText = glyph('file-text', <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" fill="currentColor" fillOpacity=".035" opacity=".6" /><path d="M14 2v6h6M8 12h8m-8 4h5" /></>)
export const FileJson = glyph('file-json', <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6" opacity=".5" /><path d="M10 11H9v2l-1 1 1 1v2h1m4-6h1v2l1 1-1 1v2h-1" /></>)
export const FileSearch = glyph('file-search', <><path d="M12 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8l6 6v4M14 2v6h6" opacity=".5" /><circle cx="15" cy="16" r="4" fill="currentColor" fillOpacity=".04" /><path d="m18 19 3 3" /></>)
export const Filter = glyph('filter', <><path d="M3 5h18M6 12h12M9 19h6" /><circle cx="8" cy="5" r="1.6" fill="currentColor" stroke="none" /><circle cx="16" cy="12" r="1.6" fill="currentColor" stroke="none" /></>)
export const SlidersHorizontal = glyph('adjust', <><path d="M3 6h18M3 12h18M3 18h18" opacity=".35" /><rect x="6" y="4" width="4" height="4" rx="1" fill="currentColor" fillOpacity=".12" /><rect x="14" y="10" width="4" height="4" rx="1" fill="currentColor" fillOpacity=".12" /><rect x="8" y="16" width="4" height="4" rx="1" fill="currentColor" fillOpacity=".12" /></>)
export const BookmarkPlus = glyph('bookmark-add', <><path d="M14 3H7a2 2 0 0 0-2 2v16l6-4 6 4v-9" opacity=".6" /><path d="M18 2v6m-3-3h6" /></>)
export const Pin = glyph('pin', <><path d="m15 3 6 6-4 1-3 5v3l-8-8h3l5-3Z" fill="currentColor" fillOpacity=".05" /><path d="m10 14-7 7" opacity=".65" /></>)
export const Save = glyph('save', <><path d="M5 3h12l4 4v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" fill="currentColor" fillOpacity=".03" /><path d="M7 3v6h9V3m-9 18v-7h10v7" opacity=".55" /></>)
export const Trash2 = glyph('delete', <><path d="M3 6h18M9 6V3h6v3" /><path d="m5 6 1 15h12l1-15M10 10v7m4-7v7" opacity=".6" /></>)
export const Star = glyph('star', <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" />)

// Status and inspection.
export const Shield = glyph('shield', <><path d="m12 2 8 3v7c0 5-8 10-8 10S4 17 4 12V5Z" fill="currentColor" fillOpacity=".04" /><path d="M12 6v10" opacity=".35" /></>)
export const ShieldCheck = glyph('shield-check', <><path d="m12 2 8 3v7c0 5-8 10-8 10S4 17 4 12V5Z" fill="currentColor" fillOpacity=".04" opacity=".65" /><path d="m8 11 3 3 5-6" /></>)
export const Clock = glyph('clock', <><circle cx="12" cy="12" r="9" opacity=".6" /><path d="M12 6v6l4 2" /></>)
export const Timer = glyph('timer', <><circle cx="12" cy="14" r="7.5" opacity=".6" /><path d="M9 2h6m-3 0v4m6 2 2-2m-8 8 3-3" /></>)
export const Info = glyph('info', <><circle cx="12" cy="12" r="9" opacity=".55" /><path d="M12 11v6" /><circle cx="12" cy="7" r="1" stroke="none" fill="currentColor" /></>)
export const Crosshair = glyph('inspect', <><circle cx="12" cy="12" r="6.5" opacity=".45" /><path d="M12 2v5m0 10v5M2 12h5m10 0h5" /><circle cx="12" cy="12" r="1.5" stroke="none" fill="currentColor" /></>)
export const Scan = glyph('scan', <><path d="M8 3H4v5m12-5h4v5M4 16v5h4m8 0h4v-5" opacity=".55" /><path d="M3 12h18M8 9v6m4-6v6m4-6v6" /></>)
export const Sparkles = glyph('insight', <><path d="m10 3 2.3 6.7L19 12l-6.7 2.3L10 21l-2.3-6.7L1 12l6.7-2.3Z" fill="currentColor" fillOpacity=".05" /><path d="M19 2v5m-2.5-2.5h5" opacity=".55" /></>)
export const Zap = glyph('bolt', <path d="m13 2-9 12h7l-1 8 10-13h-7Z" fill="currentColor" fillOpacity=".08" />)
