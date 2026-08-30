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
})
