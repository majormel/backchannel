import { Fragment } from 'react'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

type HighlightedTextProps = {
  text: string
  query: string
}

export function HighlightedText({ text, query }: HighlightedTextProps) {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) {
    return <>{text}</>
  }
  const pattern = new RegExp(`(${escapeRegExp(normalizedQuery)})`, 'gi')
  const parts = text.split(pattern)
  if (parts.length <= 1) {
    return <>{text}</>
  }
  return (
    <>
      {parts.map((part, index) => {
        if (part.toLowerCase() === normalizedQuery.toLowerCase()) {
          return <mark key={`m-${index}`} className="search-highlight">{part}</mark>
        }
        return <Fragment key={`t-${index}`}>{part}</Fragment>
      })}
    </>
  )
}
