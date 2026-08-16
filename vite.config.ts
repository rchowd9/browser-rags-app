import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Use a relative base so the production build works from GitHub Pages,
  // custom domains, and other static hosts without broken asset URLs.
  base: './',
  worker: {
    format: 'es'
  }
});