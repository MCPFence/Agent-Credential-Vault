/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{html,js,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0e17',
        bg2: '#111827',
        bg3: '#1a2332',
        bg4: '#243044',
        surface: '#111827',
        primary: '#3b82f6',
        'primary-dark': '#2563eb',
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444',
        purple: '#8b5cf6',
        cyan: '#06b6d4',
        text: '#e2e8f0',
        'text-dim': '#94a3b8',
        'text-muted': '#64748b',
        'input-bg': '#0a0e17',
        separator: '#1e293b',
        'border-2': '#334155',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '8px',
        lg: '12px',
      },
    },
  },
  plugins: [],
};
