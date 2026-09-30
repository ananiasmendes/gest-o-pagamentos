import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        papel: '#FBF6F2',
        tecido: '#FFFFFF',
        tinta: '#2A1614',
        linha: '#7A625C',
        borda: '#EADFD8',
        // nomes antigos mantidos para não mexer em todas as telas; os valores são da marca Pinho
        framboesa: { DEFAULT: '#911C19', claro: '#FBE7DC', escuro: '#6E1512' }, // bordô
        agua: { DEFAULT: '#2F6B4F', claro: '#E4F0E8' },                        // verde (ok, quitado)
        ambar: { DEFAULT: '#8F5311', claro: '#F6E7D6' },                       // caramelo escuro (atenção)
        indigo: { DEFAULT: '#6B3F2A', claro: '#F3E6DE' },                      // cacau (links, foco)
        caramelo: '#C27219',
        pessego: '#F2B091',
      },
      fontFamily: {
        display: ['"Bodoni Moda"', 'Georgia', 'serif'],
        sans: ['"Nunito Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: { etiqueta: '16px' },
    },
  },
  plugins: [],
};
export default config;
