import { useMemo } from 'react'
import { motion } from 'framer-motion'

interface DiffLine {
  type: 'unchanged' | 'added' | 'removed' | 'header'
  content: string
  lineNum1?: number
  lineNum2?: number
}

interface DiffViewerProps {
  diff: string[]
  className?: string
  maxHeight?: string
}

export function DiffViewer({ diff, className = '', maxHeight = '300px' }: DiffViewerProps) {
  const parsedDiff = useMemo((): DiffLine[] => {
    if (!diff || diff.length === 0) {
      return [{ type: 'unchanged', content: 'No differences' }]
    }

    const lines: DiffLine[] = []
    let lineNum1 = 0
    let lineNum2 = 0

    for (const line of diff) {
      if (line.startsWith('@@')) {
        // Parse hunk header like @@ -1,5 +1,5 @@
        const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
        if (match) {
          lineNum1 = parseInt(match[1])
          lineNum2 = parseInt(match[2])
        }
        lines.push({ type: 'header', content: line })
      } else if (line.startsWith('+')) {
        lines.push({
          type: 'added',
          content: line.slice(1),
          lineNum2: lineNum2++,
        })
      } else if (line.startsWith('-')) {
        lines.push({
          type: 'removed',
          content: line.slice(1),
          lineNum1: lineNum1++,
        })
      } else if (line.startsWith(' ')) {
        lines.push({
          type: 'unchanged',
          content: line.slice(1),
          lineNum1: lineNum1++,
          lineNum2: lineNum2++,
        })
      } else if (line === '---' || line.startsWith('--- ') || line.startsWith('+++ ')) {
        // File header, skip or show as header
        lines.push({ type: 'header', content: line })
      }
    }

    return lines
  }, [diff])

  const getLineClass = (type: DiffLine['type']) => {
    switch (type) {
      case 'added':
        return 'bg-emerald-500/10 text-emerald-400 border-l-2 border-emerald-500'
      case 'removed':
        return 'bg-red-500/10 text-red-400 border-l-2 border-red-500'
      case 'header':
        return 'text-cyan-400 bg-cyan-500/5 font-medium'
      default:
        return 'text-muted-foreground'
    }
  }

  const getLinePrefix = (type: DiffLine['type']) => {
    switch (type) {
      case 'added':
        return '+'
      case 'removed':
        return '-'
      case 'header':
        return ' '
      default:
        return ' '
    }
  }

  return (
    <div
      className={`font-mono text-xs overflow-auto rounded-md border border-border/50 ${className}`}
      style={{ maxHeight }}
    >
      <table className="w-full">
        <tbody>
          {parsedDiff.map((line, index) => (
            <motion.tr
              key={index}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.01 }}
              className={`${getLineClass(line.type)} hover:bg-white/5`}
            >
              <td className="px-2 py-0.5 text-right w-12 text-muted-foreground select-none border-r border-border/30">
                {line.lineNum1 || ''}
              </td>
              <td className="px-2 py-0.5 text-right w-12 text-muted-foreground select-none border-r border-border/30">
                {line.lineNum2 || ''}
              </td>
              <td className="px-2 py-0.5 text-muted-foreground select-none w-4">
                {getLinePrefix(line.type)}
              </td>
              <td className="px-2 py-0.5 whitespace-pre-wrap break-all">
                {line.content || ' '}
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface InlineDiffProps {
  value1: string
  value2: string
  className?: string
}

export function InlineDiff({ value1, value2, className = '' }: InlineDiffProps) {
  const isEqual = value1 === value2

  if (isEqual) {
    return (
      <span className={`text-emerald-400 ${className}`}>
        {value1}
      </span>
    )
  }

  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Flow 1:</span>
        <span className="text-red-400 line-through">{value1}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Flow 2:</span>
        <span className="text-emerald-400">{value2}</span>
      </div>
    </div>
  )
}
