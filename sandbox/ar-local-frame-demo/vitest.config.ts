import { defineConfig } from 'vitest/config';
// These are renderer-independent geometry tests; do not load the Svelte/Vite plugins.
export default defineConfig({ test: { include: ['test/**/*.test.ts'] } });
