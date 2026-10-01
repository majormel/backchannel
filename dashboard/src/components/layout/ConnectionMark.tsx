import { Cable } from '../ui/icons'

/** The same connection glyph used by every Connect source action. */
export function ConnectionMark() {
  return (
    <span className="connection-mark" aria-hidden="true">
      <Cable strokeWidth={1.5} />
    </span>
  )
}
