import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        papel: '#F4F3F8',
        tecido: '#FFFFFF',
        tinta: '#231F35',
        linha: '#6E6887',
        borda: '#E3E0EC',
        framboesa: { DEFAULT: '#B8235A', claro: '#F8E6ED', escuro: '#8E1745' },
        agua: { DEFAULT: '#1F7A6A', claro: '#E2F2EE' },
        ambar: { DEFAULT: '#A8671A', claro: '#FBF0DF' },
        indigo: { DEFAULT: '#3D348B', claro: '#E8E6F5' },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['"Public Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: { etiqueta: '14px' },
    },
  },
  plugins: [],
};
export default config;
