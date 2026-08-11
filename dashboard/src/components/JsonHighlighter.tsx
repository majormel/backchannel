interface JsonHighlighterProps {
  content: string
  className?: string
  highlightQuery?: string
}

function JsonHighlighter({ content, className = '', highlightQuery = '' }: JsonHighlighterProps) {
  const highlighted = highlightJson(content, highlightQuery)

  return (
    <pre className={`${className}`} dangerouslySetInnerHTML={{ __html: highlighted }} />
  )
}

function highlightJson(json: string, query: string): string {
  let escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  escaped = escaped.replace(
    /"([^"\\]*(\\.[^"\\]*)*)"(\s*:)?/g,
    (_match, value, _, colon) => {
      if (colon) {
        return `<span class="json-key">"${escapeString(value)}"</span><span class="json-colon">:</span>`
      }
      return `<span class="json-string">"${escapeString(value)}"</span>`
    }
  )

  escaped = escaped.replace(
    /\b(-?\d+\.?\d*([eE][+-]?\d+)?)\b/g,
    '<span class="json-number">$1</span>'
  )

  escaped = escaped.replace(
    /\b(true|false|null)\b/g,
    '<span class="json-boolean">$1</span>'
  )

  escaped = escaped.replace(/([{}[\]])/g, '<span class="json-bracket">$1</span>')

  return highlightHtmlContent(escaped, query)
}

function escapeString(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlightHtmlContent(html: string, query: string): string {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) {
    return html
  }
  const entityPattern = /^(&[a-zA-Z][a-zA-Z0-9]+;|&#\d+;|&#x[0-9A-Fa-f]+;)$/u
  const pattern = new RegExp(`(${escapeRegExp(normalizedQuery)})`, 'gi')
  return html
    .split(/(<[^>]+>)/g)
    .map((segment) => {
      if (segment.startsWith('<')) {
        return segment
      }
      return segment
        .split(/(&[a-zA-Z][a-zA-Z0-9]+;|&#\d+;|&#x[0-9A-Fa-f]+;)/g)
        .map((token) => {
          if (entityPattern.test(token)) {
            return token
          }
          return token.replace(pattern, '<mark class="search-highlight">$1</mark>')
        })
        .join('')
    })
    .join('')
}

export default JsonHighlighter
