import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    {
      name: 'markdown-raw',
      transform(code, id) {
        if (id.endsWith('.md')) {
          return {
            code: `export default ${JSON.stringify(code)};`,
            map: null,
          };
        }
      },
    },
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
