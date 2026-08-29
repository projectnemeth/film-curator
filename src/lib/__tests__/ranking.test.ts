// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../anthropic', () => ({ getAnthropicClient: vi.fn() }))

import { getAnthropicClient } from '../anthropic'
import { rankByTaste } from '../ranking'

describe('rankByTaste', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns candidates unchanged when there is no taste history yet', async () => {
    const candidates = [{ id: 'a', name: 'A', overview: null }, { id: 'b', name: 'B', overview: null }]
    const result = await rankByTaste(candidates, [])
    expect(result).toEqual(['a', 'b'])
    expect(getAnthropicClient).not.toHaveBeenCalled()
  })

  it('returns an empty array for no candidates without calling Claude', async () => {
    const result = await rankByTaste([], [{ titleName: 'X', rating: 'LOVED' }])
    expect(result).toEqual([])
    expect(getAnthropicClient).not.toHaveBeenCalled()
  })

  it('parses and returns the ranked id order from Claude', async () => {
    const candidates = [{ id: 'a', name: 'A', overview: null }, { id: 'b', name: 'B', overview: null }]
    ;(getAnthropicClient as ReturnType<typeof vi.fn>).mockReturnValue({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify({ rankedTitleIds: ['b', 'a'] }) }],
        }),
      },
    })

    const result = await rankByTaste(candidates, [{ titleName: 'Jurassic Park', rating: 'LOVED' }])
    expect(result).toEqual(['b', 'a'])
  })

  it('finds the text block even when a thinking block precedes it', async () => {
    const candidates = [{ id: 'a', name: 'A', overview: null }, { id: 'b', name: 'B', overview: null }]
    ;(getAnthropicClient as ReturnType<typeof vi.fn>).mockReturnValue({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            { type: 'thinking', thinking: 'some reasoning...' },
            { type: 'text', text: JSON.stringify({ rankedTitleIds: ['b', 'a'] }) },
          ],
        }),
      },
    })

    const result = await rankByTaste(candidates, [{ titleName: 'Jurassic Park', rating: 'LOVED' }])
    expect(result).toEqual(['b', 'a'])
  })
})
