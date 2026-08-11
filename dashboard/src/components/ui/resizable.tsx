import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

type ResizablePanelGroupProps = {
  children: [React.ReactNode, React.ReactNode]
  className?: string
  defaultLayout?: [number, number]
  minSizes?: [number, number]
}

export function ResizablePanelGroup({
  children,
  className,
  defaultLayout = [58, 42],
  minSizes = [38, 26],
}: ResizablePanelGroupProps) {
  const groupRef = useRef<HTMLDivElement>(null)
  const [primaryWidth, setPrimaryWidth] = useState(defaultLayout[0])
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!dragging) return

    const handlePointerMove = (event: PointerEvent) => {
      const group = groupRef.current
      if (!group) return
      const bounds = group.getBoundingClientRect()
      if (!bounds.width) return
      const minPrimary = minSizes[0]
      const maxPrimary = 100 - minSizes[1]
      const next = ((event.clientX - bounds.left) / bounds.width) * 100
      setPrimaryWidth(Math.min(maxPrimary, Math.max(minPrimary, next)))
    }

    const handlePointerUp = () => setDragging(false)

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [dragging, minSizes])

  return (
    <div
      ref={groupRef}
      className={cn("grid min-h-0 w-full", className)}
      style={{ gridTemplateColumns: `${primaryWidth}% 12px minmax(0, 1fr)` }}
    >
      <div className="min-w-0 overflow-hidden">{children[0]}</div>
      <button
        type="button"
        aria-label="Resize panels"
        onPointerDown={() => setDragging(true)}
        onDoubleClick={() => setPrimaryWidth(defaultLayout[0])}
        className={cn(
          "group relative h-full w-3 cursor-col-resize touch-none border-x border-transparent",
          dragging && "border-border/80"
        )}
      >
        <span className="absolute inset-y-4 left-1/2 w-px -translate-x-1/2 rounded-full bg-border/80 transition-colors group-hover:bg-foreground/40" />
        <span className="absolute left-1/2 top-1/2 h-14 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.06)] transition-[background-color,box-shadow] group-hover:bg-white/20 group-hover:shadow-[0_0_0_1px_rgba(255,255,255,0.12)]" />
      </button>
      <div className="min-w-0 overflow-hidden">{children[1]}</div>
    </div>
  )
}
