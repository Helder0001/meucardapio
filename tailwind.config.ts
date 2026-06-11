import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        },
        // Variáveis shadcn/ui — necessárias para @apply border-border, bg-background, etc.
        background:       'hsl(var(--background))',
        foreground:       'hsl(var(--foreground))',
        card: {
          DEFAULT:        'hsl(var(--card))',
          foreground:     'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT:        'hsl(var(--popover))',
          foreground:     'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT:        'hsl(var(--primary))',
          foreground:     'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT:        'hsl(var(--secondary))',
          foreground:     'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT:        'hsl(var(--muted))',
          foreground:     'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT:        'hsl(var(--accent))',
          foreground:     'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT:        'hsl(var(--destructive))',
          foreground:     'hsl(var(--destructive-foreground))',
        },
        border:           'hsl(var(--border))',
        input:            'hsl(var(--input))',
        ring:             'hsl(var(--ring))',
        success: {
          DEFAULT:        'hsl(var(--success))',
          foreground:     'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT:        'hsl(var(--warning))',
          foreground:     'hsl(var(--warning-foreground))',
        },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}

export default config
