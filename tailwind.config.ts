import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        term: ['"Cascadia Mono"', 'Consolas', '"Courier New"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
