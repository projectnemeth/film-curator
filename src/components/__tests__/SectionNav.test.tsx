import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SectionNav } from '../SectionNav'

describe('SectionNav', () => {
  it('links to each dashboard section by id', () => {
    render(<SectionNav counts={{ watchlist: 12, loved: 34 }} />)
    expect(screen.getByRole('link', { name: /Not Seen/ })).toHaveAttribute('href', '#not-seen')
    expect(screen.getByRole('link', { name: /Watchlist/ })).toHaveAttribute('href', '#watchlist')
    expect(screen.getByRole('link', { name: /Loved/ })).toHaveAttribute('href', '#loved')
  })

  it('shows the item count alongside the watchlist and loved links', () => {
    render(<SectionNav counts={{ watchlist: 12, loved: 34 }} />)
    expect(screen.getByRole('link', { name: 'Watchlist (12)' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Loved (34)' })).toBeInTheDocument()
  })

  it('omits the watchlist link when the watchlist is empty', () => {
    render(<SectionNav counts={{ watchlist: 0, loved: 34 }} />)
    expect(screen.queryByRole('link', { name: /Watchlist/ })).toBeNull()
    expect(screen.getByRole('link', { name: /Loved/ })).toBeInTheDocument()
  })

  it('omits the loved link when nothing is loved', () => {
    render(<SectionNav counts={{ watchlist: 12, loved: 0 }} />)
    expect(screen.queryByRole('link', { name: /Loved/ })).toBeNull()
    expect(screen.getByRole('link', { name: /Watchlist/ })).toBeInTheDocument()
  })

  it('always offers the Not Seen link, even with both other sections empty', () => {
    render(<SectionNav counts={{ watchlist: 0, loved: 0 }} />)
    expect(screen.getByRole('link', { name: 'Not Seen' })).toBeInTheDocument()
  })

  it('makes each jump link fill the bar so the whole bar height is tappable', () => {
    const { container } = render(<SectionNav counts={{ watchlist: 12, loved: 34 }} />)
    // The bar sets its own height (h-11 = 44px) rather than padding it out:
    // vertical padding would shrink the stretched links back below 44px.
    const bar = container.querySelector('nav') as HTMLElement
    expect(bar.className).toContain('h-11')
    expect(bar.className).not.toMatch(/\bpy-/)
    for (const name of ['Not Seen', 'Watchlist (12)', 'Loved (34)']) {
      const link = screen.getByRole('link', { name })
      expect(link.className).toContain('flex')
      expect(link.className).toContain('items-center')
      expect(link.className).toContain('self-stretch')
    }
  })
})
