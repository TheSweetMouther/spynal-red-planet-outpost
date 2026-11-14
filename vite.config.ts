import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

// base './' so the static build works from any GitHub Pages sub-path.
export default defineConfig({
  base: './',
  plugins: [preact()],
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
