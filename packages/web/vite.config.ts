import { defineConfig } from 'vite';
export default defineConfig({
  server: {
    host: '0.0.0.0',
    proxy: {
      '/ws': { target: 'ws://127.0.0.1:3000', ws: true },
      '/api': 'http://127.0.0.1:3000',
      '/health': 'http://127.0.0.1:3000',
      '/logo': 'http://127.0.0.1:3000',
    },
  },
  preview: {
    host: '0.0.0.0',
  },
});
