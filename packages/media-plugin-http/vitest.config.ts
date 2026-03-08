import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@streamhub/media-plugin-sdk': path.resolve(__dirname, '../media-plugin-sdk/src/index.ts'),
    },
  },
});
