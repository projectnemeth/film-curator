import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: '#14151A',
        surface: '#1D1F29',
        border: '#2A2C38',
        accent: '#E5A34A',
        accentGlow: '#F2C078',
        danger: '#D65A50',
        textPrimary: '#F2F2F2',
        textSecondary: '#8B8FA5',
      },
      fontFamily: {
        display: ['var(--font-bebas)'],
        body: ['var(--font-inter)'],
        mono: ['var(--font-mono)'],
      },
    },
  },
  plugins: [],
}

export default config
