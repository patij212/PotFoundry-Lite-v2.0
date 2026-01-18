import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    build: {
        outDir: 'dist',
        sourcemap: true,
        emptyOutDir: true,
    },
    server: {
        port: 3000,
        host: '127.0.0.1',
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./src/test/setup.ts'],
        include: ['src/**/*.test.{ts,tsx}'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            include: ['src/**/*.{ts,tsx}'],
            exclude: [
                'src/**/*.test.{ts,tsx}',
                'src/test/**',
                'src/main.tsx',
                'src/vite-env.d.ts',
            ],
            // Thresholds can be enabled once more tests are added:
            // thresholds: {
            //     statements: 80,
            //     branches: 80,
            //     functions: 80,
            //     lines: 80,
            // },
        },
    },
});
