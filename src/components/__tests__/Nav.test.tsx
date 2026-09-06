import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { Nav } from '../Nav'

const usePathnameMock = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
}))

describe('Nav', () => {
  it('renders nothing on the login page', () => {
    usePathnameMock.mockReturnValue('/login')
    const { container } = render(<Nav />)
    expect(container.querySelector('nav')).toBeNull()
  })

  it('renders the nav links on other pages', () => {
    usePathnameMock.mockReturnValue('/')
    const { container, getByText } = render(<Nav />)
    expect(container.querySelector('nav')).not.toBeNull()
    expect(getByText('Dashboard')).toBeTruthy()
    expect(getByText('Rate More Movies')).toBeTruthy()
  })

  it('stays pinned to the top at the height SectionNav offsets against', () => {
    usePathnameMock.mockReturnValue('/')
    const { container } = render(<Nav />)
    const nav = container.querySelector('nav') as HTMLElement
    // SectionNav sits directly below this bar with `top-14`, so the two must agree.
    expect(nav.className).toContain('sticky')
    expect(nav.className).toContain('top-0')
    expect(nav.className).toContain('h-14')
  })

  it('makes each nav link fill the 56px bar so the whole bar height is tappable', () => {
    usePathnameMock.mockReturnValue('/')
    const { getByText } = render(<Nav />)
    for (const label of ['Dashboard', 'Rate More Movies']) {
      const link = getByText(label)
      expect(link.className).toContain('flex')
      expect(link.className).toContain('items-center')
      expect(link.className).toContain('self-stretch')
    }
  })
})
