import { motion, useMotionTemplate, useMotionValue } from 'framer-motion'
import type { ButtonHTMLAttributes, MouseEvent } from 'react'

import { cn } from '@/lib/utils'

type SpotlightCardProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  spotlightColor?: string
  spotlightSize?: number
}

export function SpotlightCard({
  children,
  className,
  spotlightColor = 'hsl(var(--accent) / 0.09)',
  spotlightSize = 320,
  onMouseMove,
  ...props
}: SpotlightCardProps) {
  const mouseX = useMotionValue(-spotlightSize)
  const mouseY = useMotionValue(-spotlightSize)
  const background = useMotionTemplate`radial-gradient(${spotlightSize}px circle at ${mouseX}px ${mouseY}px, ${spotlightColor}, transparent 76%)`

  const handleMouseMove = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    mouseX.set(event.clientX - rect.left)
    mouseY.set(event.clientY - rect.top)
    onMouseMove?.(event)
  }

  return (
    <button
      type="button"
      className={cn(
        'group relative overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.03] p-5 text-left shadow-[var(--elevation-1)] backdrop-blur-md transition-[border-color,background-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-white/[0.12] hover:bg-white/[0.05] hover:shadow-[var(--elevation-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:hover:transform-none',
        className
      )}
      onMouseMove={handleMouseMove}
      {...props}
    >
      <motion.span aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100" style={{ background }} />
      <span className="relative z-10 block">{children}</span>
    </button>
  )
}
