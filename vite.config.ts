import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages deploys under subpaths: https://username.github.io/repo-name/
  base: process.env.NODE_ENV === 'production' ? '/<your-repo-name>/' : '/',
  worker: {
    format: 'es'
  }
});