// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../anthropic', () => ({
  getAnthropicClient: vi.fn(),
}))
vi.mock('../prisma', () => ({
  prisma: {
    contentScore: { findUnique: vi.fn(), create: vi.fn() },
    title: { findUniqueOrThrow: vi.fn() },
  },
}))

import { getAnthropicClient } from '../anthropic'
import { prisma } from '../prisma'
import { getOrCreateContentScore } from '../contentScoring'

describe('getOrCreateContentScore', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the existing score without calling Claude', async () => {
    const existing = { id: 'cs1', titleId: 't1', violence: 1, language: 1, sexNudity: 0, scariness: 1, isUnrated: false, isNC17: false, sourceNotes: '', computedAt: new Date() }
    ;(prisma.contentScore.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existing)

    const result = await getOrCreateContentScore('t1')

    expect(result).toBe(existing)
    expect(getAnthropicClient).not.toHaveBeenCalled()
  })

  it('synthesizes and persists a new score when none exists', async () => {
    ;(prisma.contentScore.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(prisma.title.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1', name: 'Jurassic Park', year: 1993 })

    const synthesized = { violence: 3, language: 1, sexNudity: 0, scariness: 5, isUnrated: false, isNC17: false, sourceNotes: 'Peril from dinosaurs, no gore shown on screen.' }
    const mockCreate = vi.fn().mockResolvedValue({ id: 'cs1', titleId: 't1', ...synthesized, computedAt: new Date() })
    ;(prisma.contentScore.create as ReturnType<typeof vi.fn>) = mockCreate

    ;(getAnthropicClient as ReturnType<typeof vi.fn>).mockReturnValue({
      messages: {
        create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify(synthesized) }] }),
      },
    })

    const result = await getOrCreateContentScore('t1')

    expect(mockCreate).toHaveBeenCalledWith({ data: { titleId: 't1', ...synthesized } })
    expect(result.violence).toBe(3)
  })

  it('finds the text block even when a thinking block precedes it', async () => {
    ;(prisma.contentScore.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(prisma.title.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1', name: 'Jurassic Park', year: 1993 })

    const synthesized = { violence: 3, language: 1, sexNudity: 0, scariness: 5, isUnrated: false, isNC17: false, sourceNotes: 'Peril from dinosaurs, no gore shown on screen.' }
    const mockCreate = vi.fn().mockResolvedValue({ id: 'cs1', titleId: 't1', ...synthesized, computedAt: new Date() })
    ;(prisma.contentScore.create as ReturnType<typeof vi.fn>) = mockCreate

    ;(getAnthropicClient as ReturnType<typeof vi.fn>).mockReturnValue({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            { type: 'thinking', thinking: 'some reasoning...' },
            { type: 'text', text: JSON.stringify(synthesized) },
          ],
        }),
      },
    })

    const result = await getOrCreateContentScore('t1')

    expect(mockCreate).toHaveBeenCalledWith({ data: { titleId: 't1', ...synthesized } })
    expect(result.violence).toBe(3)
  })

  it('strips a markdown code fence wrapping the JSON response', async () => {
    ;(prisma.contentScore.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(prisma.title.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1', name: 'Jurassic Park', year: 1993 })

    const synthesized = { violence: 3, language: 1, sexNudity: 0, scariness: 5, isUnrated: false, isNC17: false, sourceNotes: 'Peril from dinosaurs, no gore shown on screen.' }
    const mockCreate = vi.fn().mockResolvedValue({ id: 'cs1', titleId: 't1', ...synthesized, computedAt: new Date() })
    ;(prisma.contentScore.create as ReturnType<typeof vi.fn>) = mockCreate

    ;(getAnthropicClient as ReturnType<typeof vi.fn>).mockReturnValue({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: '```json\n' + JSON.stringify(synthesized) + '\n```' }],
        }),
      },
    })

    const result = await getOrCreateContentScore('t1')

    expect(mockCreate).toHaveBeenCalledWith({ data: { titleId: 't1', ...synthesized } })
    expect(result.violence).toBe(3)
  })

  it('extracts the final text block even when search/fetch tool-result blocks precede it', async () => {
    ;(prisma.contentScore.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(prisma.title.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1', name: 'Jurassic Park', year: 1993 })

    const synthesized = { violence: 3, language: 1, sexNudity: 0, scariness: 5, isUnrated: false, isNC17: false, sourceNotes: 'Common Sense Media: dinosaur peril, no gore shown.' }
    const mockCreate = vi.fn().mockResolvedValue({ id: 'cs1', titleId: 't1', ...synthesized, computedAt: new Date() })
    ;(prisma.contentScore.create as ReturnType<typeof vi.fn>) = mockCreate

    ;(getAnthropicClient as ReturnType<typeof vi.fn>).mockReturnValue({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            { type: 'thinking', thinking: 'Let me search for this title...' },
            { type: 'server_tool_use', id: 'srv1', name: 'web_search', input: { query: 'Jurassic Park Common Sense Media' } },
            { type: 'web_search_tool_result', tool_use_id: 'srv1', content: [{ type: 'web_search_result', title: 'Jurassic Park - Common Sense Media', url: 'https://www.commonsensemedia.org/movie-reviews/jurassic-park' }] },
            { type: 'text', text: JSON.stringify(synthesized) },
          ],
        }),
      },
    })

    const result = await getOrCreateContentScore('t1')

    expect(mockCreate).toHaveBeenCalledWith({ data: { titleId: 't1', ...synthesized } })
    expect(result.violence).toBe(3)
  })

  it('uses the last text block, not the first, when Claude narrates before its final JSON answer', async () => {
    ;(prisma.contentScore.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(prisma.title.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1', name: 'Jurassic Park', year: 1993 })

    const synthesized = { violence: 3, language: 1, sexNudity: 0, scariness: 5, isUnrated: false, isNC17: false, sourceNotes: 'Common Sense Media: dinosaur peril, no gore shown.' }
    const mockCreate = vi.fn().mockResolvedValue({ id: 'cs1', titleId: 't1', ...synthesized, computedAt: new Date() })
    ;(prisma.contentScore.create as ReturnType<typeof vi.fn>) = mockCreate

    ;(getAnthropicClient as ReturnType<typeof vi.fn>).mockReturnValue({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            { type: 'text', text: 'Good, I have the IMDb Parents Guide content. Let me retry...' },
            { type: 'text', text: JSON.stringify(synthesized) },
          ],
        }),
      },
    })

    const result = await getOrCreateContentScore('t1')

    expect(mockCreate).toHaveBeenCalledWith({ data: { titleId: 't1', ...synthesized } })
    expect(result.violence).toBe(3)
  })

  it('passes an abort signal through to the Claude API call when provided', async () => {
    ;(prisma.contentScore.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(prisma.title.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1', name: 'Jurassic Park', year: 1993 })

    const synthesized = { violence: 3, language: 1, sexNudity: 0, scariness: 5, isUnrated: false, isNC17: false, sourceNotes: 'test' }
    const mockCreate = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify(synthesized) }] })
    ;(getAnthropicClient as ReturnType<typeof vi.fn>).mockReturnValue({ messages: { create: mockCreate } })
    ;(prisma.contentScore.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'cs1', titleId: 't1', ...synthesized, computedAt: new Date() })

    const controller = new AbortController()
    await getOrCreateContentScore('t1', controller.signal)

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-5' }),
      expect.objectContaining({ signal: controller.signal })
    )
  })

  it('disables extended thinking and limits search/fetch tool use to reduce cost and latency', async () => {
    ;(prisma.contentScore.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(prisma.title.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1', name: 'Jurassic Park', year: 1993 })

    const synthesized = { violence: 3, language: 1, sexNudity: 0, scariness: 5, isUnrated: false, isNC17: false, sourceNotes: 'test' }
    const mockCreate = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify(synthesized) }] })
    ;(getAnthropicClient as ReturnType<typeof vi.fn>).mockReturnValue({ messages: { create: mockCreate } })
    ;(prisma.contentScore.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'cs1', titleId: 't1', ...synthesized, computedAt: new Date() })

    await getOrCreateContentScore('t1')

    const [params] = mockCreate.mock.calls[0]
    expect(params.thinking).toEqual({ type: 'disabled' })
    expect(params.tools.find((t: { name: string }) => t.name === 'web_search').max_uses).toBe(1)
    expect(params.tools.find((t: { name: string }) => t.name === 'web_fetch').max_uses).toBe(1)
  })

  it('caps web_fetch content tokens to bound the cost of a runaway page', async () => {
    ;(prisma.contentScore.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(prisma.title.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1', name: 'Jurassic Park', year: 1993 })

    const synthesized = { violence: 3, language: 1, sexNudity: 0, scariness: 5, isUnrated: false, isNC17: false, sourceNotes: 'test' }
    const mockCreate = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify(synthesized) }] })
    ;(getAnthropicClient as ReturnType<typeof vi.fn>).mockReturnValue({ messages: { create: mockCreate } })
    ;(prisma.contentScore.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'cs1', titleId: 't1', ...synthesized, computedAt: new Date() })

    await getOrCreateContentScore('t1')

    const [params] = mockCreate.mock.calls[0]
    expect(params.tools.find((t: { name: string }) => t.name === 'web_fetch').max_content_tokens).toBe(20_000)
  })
})
