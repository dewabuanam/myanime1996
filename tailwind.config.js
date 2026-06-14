/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1a1410',
        carbon: '#231b16',
        ember: '#d4a574',
        amberline: '#e8b873',
        rust: '#c65f4d',
        cream: '#f5ead2',
        brass: '#725b36',
        greenVU: '#8fcf7b',
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
