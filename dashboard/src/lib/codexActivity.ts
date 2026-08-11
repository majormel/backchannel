import type { OrbState } from 'thinking-orbs'

import type { CodexReview } from './types'

export function codexOrbState(starting: boolean, review: CodexReview | null): OrbState {
  if (starting || review?.status === 'starting') return 'connecting'
  if (review?.status === 'running' && review.output.trim()) return 'composing'
  return 'searching'
}
