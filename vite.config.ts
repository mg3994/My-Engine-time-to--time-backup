import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      name: 'AntinnaEngineLib',
      fileName: (format) => `antinna-engine.${format}.js`,
      formats: ['iife', 'es'],
    },
    outDir: 'dist',
    minify: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
});
