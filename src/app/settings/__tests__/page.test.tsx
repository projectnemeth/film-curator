import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import SettingsPage from '../page'

describe('SettingsPage', () => {
  it('shows existing overrides', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith('/api/overrides')) {
        return Promise.resolve({ json: async () => ({ overrides: [{ id: 'o1', titleId: 't1', decision: 'APPROVED', title: { name: 'Jurassic Park', posterPath: '/poster.jpg' } }] }) })
      }
      return Promise.resolve({ json: async () => ({}) })
    }) as unknown as typeof fetch

    render(<SettingsPage />)
    expect(await screen.findByText(/Jurassic Park: APPROVED/)).toBeInTheDocument()
  })
})
