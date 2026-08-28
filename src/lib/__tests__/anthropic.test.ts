// @vitest-environment node

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getAnthropicClient, resetAnthropicClientForTests } from '../anthropic'

const originalKey = process.env.ANTHROPIC_API_KEY

beforeEach(() => {
  resetAnthropicClientForTests()
})

afterEach(() => {
  process.env.ANTHROPIC_API_KEY = originalKey
  resetAnthropicClientForTests()
})

describe('getAnthropicClient', () => {
  it('throws when ANTHROPIC_API_KEY is not set', () => {
    delete process.env.ANTHROPIC_API_KEY
    expect(() => getAnthropicClient()).toThrow('ANTHROPIC_API_KEY is not set')
  })

  it('returns the same instance on repeated calls', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const first = getAnthropicClient()
    const second = getAnthropicClient()
    expect(first).toBe(second)
  })
})
