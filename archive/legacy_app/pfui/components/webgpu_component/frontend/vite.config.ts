import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? './' : '/',
  plugins: [react()],
  build: {
    outDir: 'build',
    sourcemap: true,
    emptyOutDir: true,
  },
  server: {
    port: 4173,
    host: '127.0.0.1',
  },
}));
