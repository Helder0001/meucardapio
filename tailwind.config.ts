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
      boxShadow: {
        xs:       'var(--shadow-xs)',
        card:     'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
        DEFAULT:  'var(--shadow-md)',
        dropdown: 'var(--shadow-dropdown)',
        modal:    'var(--shadow-modal)',
      },
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
        sidebar: {
          DEFAULT:      'hsl(var(--sidebar-bg))',
          foreground:   'hsl(var(--sidebar-fg))',
          'active-bg':  'hsl(var(--sidebar-active-bg))',
          'active-fg':  'hsl(var(--sidebar-active-fg))',
          'hover-bg':   'hsl(var(--sidebar-hover-bg))',
          border:       'hsl(var(--sidebar-border))',
        },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
      },
      borderRadius: {
        // Escala única, toda derivada de --radius — antes só sm/md/lg
        // vinham daqui; xl/2xl/3xl caíam no valor solto do Tailwind,
        // por isso dashboard (lg/xl) e storefront (2xl/3xl) pareciam
        // duas linguagens visuais diferentes.
        sm:  'calc(var(--radius) - 4px)',
        md:  'calc(var(--radius) - 2px)',
        lg:  'var(--radius)',
        xl:  'calc(var(--radius) + 4px)',
        '2xl': 'calc(var(--radius) + 8px)',
        '3xl': 'calc(var(--radius) + 12px)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}

export default config
