import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // 'base' must be set to './' or the repo name for GitHub Pages to resolve assets correctly
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
