import { describe, expect, it } from 'vitest'

import { buildSequenceDiagramSyntax } from '../src/components/SequenceDiagram'

describe('sequence diagram syntax', () => {
  it('uses generated participant identifiers and keeps captured labels on one line', () => {
    const syntax = buildSequenceDiagramSyntax({
      participants: ['client', 'api.test\nparticipant INJECTED as attacker'],
      messages: [
        {
          from: 'client',
          to: 'api.test\nparticipant INJECTED as attacker',
          method: 'GET\nclick P1 callback',
          path: '/items/<script>alert(1)</script>\nNote over P1: injected',
          status: 200,
        },
      ],
    })

    expect(syntax).toContain('participant P1 as client')
    expect(syntax).toContain('participant P2 as api.test participant INJECTED as attacker')
    expect(syntax).toContain('P1->>P2: [OK] GET click P1 cal /items/_script_alert(1)_/script_ Note over P1: injected')
    expect(syntax).not.toContain('\nparticipant INJECTED')
    expect(syntax).not.toContain('<script>')
  })
})
