import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const apiTarget = `http://127.0.0.1:${process.env.PORT ?? 8787}`;

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': apiTarget } },
  preview: { proxy: { '/api': apiTarget } },
  test: {
    projects: [
      { extends: true, test: { name: 'server', include: ['tests/server/**/*.test.ts'], environment: 'node' } },
      // The A2UI React SDK defines custom elements on import, so it needs a DOM.
      { extends: true, test: { name: 'web', include: ['tests/web/**/*.test.ts?(x)'], environment: 'happy-dom' } },
    ],
  },
});
