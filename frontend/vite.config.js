import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Optional: proxy /api to backend so you can use relative URLs in dev.
      // Frontend code uses VITE_API_URL — if you leave VITE_API_URL empty,
      // requests go to /api/* and Vite forwards them here.
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true
      }
    }
  }
});

