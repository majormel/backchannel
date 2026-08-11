import { describe, expect, it } from 'vitest'

import { codexOrbState } from '../src/lib/codexActivity'
import type { CodexReview } from '../src/lib/types'

function review(status: CodexReview['status'], output = ''): CodexReview {
  return {
    id: 'review-1',
    thread_id: null,
    turn_id: null,
    status,
    output,
    error: null,
    created_at: 0,
    updated_at: 0,
    events: [],
  }
}

describe('Codex orb state', () => {
  it('uses connecting while a review starts', () => {
    expect(codexOrbState(true, null)).toBe('connecting')
    expect(codexOrbState(false, review('starting'))).toBe('connecting')
  })

  it('uses searching before streamed output arrives', () => {
    expect(codexOrbState(false, review('running'))).toBe('searching')
  })

  it('uses composing after output begins streaming', () => {
    expect(codexOrbState(false, review('running', 'Finding evidence...'))).toBe('composing')
  })
})
