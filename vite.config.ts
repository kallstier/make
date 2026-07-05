import { defineConfig } from 'vite';

export default defineConfig({
  base: '/make/',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000
  }
});
