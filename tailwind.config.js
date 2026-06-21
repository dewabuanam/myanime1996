/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        carbon: 'rgb(var(--color-carbon) / <alpha-value>)',
        ember: 'rgb(var(--color-ember) / <alpha-value>)',
        amberline: 'rgb(var(--color-amberline) / <alpha-value>)',
        rust: 'rgb(var(--color-rust) / <alpha-value>)',
        cream: 'rgb(var(--color-cream) / <alpha-value>)',
        brass: 'rgb(var(--color-brass) / <alpha-value>)',
        greenVU: 'rgb(var(--color-greenvu) / <alpha-value>)',
      },
      fontFamily: {
        display: ['Oswald', 'Bahnschrift', 'Arial Narrow', 'sans-serif'],
        mono: ['Share Tech Mono', 'Cascadia Mono', 'Consolas', 'monospace'],
      },
      boxShadow: {
        crt: '0 0 30px rgba(212, 165, 116, 0.16), inset 0 0 45px rgba(0, 0, 0, 0.42)',
        glow: '0 0 18px rgba(232, 184, 115, 0.25)',
      },
      backgroundImage: {
        'scan-radial': 'radial-gradient(circle at top left, rgba(232,184,115,0.14), transparent 32rem)',
      },
    },
  },
  plugins: [],
};
