/** @type {import('tailwindcss').Config} */

// Cores e tipografia seguem a Apple HIG (skill apple-hig-design): cor por PAPEL,
// nunca por tom, e a escala tipográfica do iOS. Os valores moram em
// src/index.css como variáveis; aqui só ganham nome de classe.
//
// Cores com canal (`rgb(var(--x) / <alpha-value>)`) aceitam `/10`, `/15`… para
// o fundo "tinted" dos controles. Os rótulos já têm a transparência da HIG
// embutida (secondaryLabel = 60% etc.) e por isso entram como cor fechada.
const canal = (v) => `rgb(var(${v}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      colors: {
        // texto (label / secondaryLabel / tertiaryLabel)
        label: {
          DEFAULT: 'var(--label-1)',
          2: 'var(--label-2)',
          3: 'var(--label-3)',
        },
        // fundos agrupados: tela, célula, dentro da célula
        canvas: 'var(--fundo-1)',
        surface: {
          DEFAULT: 'var(--fundo-2)',
          2: 'var(--fundo-3)',
        },
        separator: 'var(--separador)',
        // preenchimento de controle (campo, botão cinza, segmented)
        fill: {
          DEFAULT: 'var(--fill-1)',
          2: 'var(--fill-2)',
        },
        accent: canal('--acento'),
        success: canal('--sucesso'),
        warning: canal('--alerta'),
        danger: canal('--erro'),
        indigo: canal('--indigo'),
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', '"SF Mono"', 'Menlo', 'monospace'],
      },
      // Escala iOS Large, números oficiais da HIG. Body é 17, não 14.
      fontSize: {
        'large-title': ['34px', { lineHeight: '41px', letterSpacing: '0.011em' }],
        'title-1': ['28px', { lineHeight: '34px', letterSpacing: '0.013em' }],
        'title-2': ['22px', { lineHeight: '28px', letterSpacing: '-0.012em' }],
        'title-3': ['20px', { lineHeight: '25px', letterSpacing: '-0.022em' }],
        headline: ['17px', { lineHeight: '22px', letterSpacing: '-0.025em' }],
        body: ['17px', { lineHeight: '22px', letterSpacing: '-0.025em' }],
        callout: ['16px', { lineHeight: '21px', letterSpacing: '-0.02em' }],
        subhead: ['15px', { lineHeight: '20px', letterSpacing: '-0.015em' }],
        footnote: ['13px', { lineHeight: '18px', letterSpacing: '-0.005em' }],
        'caption-1': ['12px', { lineHeight: '16px' }],
        'caption-2': ['11px', { lineHeight: '13px', letterSpacing: '0.006em' }],
      },
      borderRadius: {
        // célula agrupada, campo, botão, folha
        celula: '10px',
        controle: '12px',
        folha: '20px',
      },
      minHeight: { toque: '44px' },
      minWidth: { toque: '44px' },
      height: { toque: '44px' },
      width: { toque: '44px' },
      boxShadow: {
        folha: '0 18px 48px rgb(0 0 0 / 0.18), 0 2px 8px rgb(0 0 0 / 0.08)',
        flutuante: '0 8px 24px rgb(0 0 0 / 0.14)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'fade-in-up': 'fade-in-up 200ms ease-out',
      },
    },
  },
  plugins: [],
};
