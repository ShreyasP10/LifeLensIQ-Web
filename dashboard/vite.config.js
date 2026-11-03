import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: '0.0.0.0' },
  build: { outDir: 'dist' },
  test: {
    root: fileURLToPath(new URL('./', import.meta.url)),
  },
});
