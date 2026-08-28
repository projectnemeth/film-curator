import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import SettingsPage from '../page'

describe('SettingsPage', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith('/api/mode-settings')) {
        return Promise.resolve({
          json: async () => ({ settings: { mode: 'FAMILY', maxViolence: 4, maxLanguage: 2, maxSexNudity: 1, maxScariness: 5, allowUnrated: false, allowNC17: false } }),
        })
      }
      if (url.startsWith('/api/overrides')) {
        return Promise.resolve({ json: async () => ({ overrides: [{ id: 'o1', titleId: 't1', decision: 'APPROVED', title: { name: 'Jurassic Park' } }] }) })
      }
      return Promise.resolve({ json: async () => ({}) })
    }) as unknown as typeof fetch
  })

  it('shows the current thresholds and existing overrides', async () => {
    render(<SettingsPage />)
    expect(await screen.findByDisplayValue('4')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/Jurassic Park: APPROVED/)).toBeInTheDocument())
  })
})
