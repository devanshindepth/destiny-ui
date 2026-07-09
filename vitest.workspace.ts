import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'core',
      root: './packages/core',
      include: ['src/**/*.test.ts'],
      environment: 'node',
      passWithNoTests: true,
    },
  },
  {
    test: {
      name: 'server',
      root: './packages/server',
      include: ['src/**/*.test.ts'],
      environment: 'node',
      passWithNoTests: true,
    },
  },
  // Editor uses its own vite.config.ts so Preact aliases and jsdom are picked up
  './packages/editor/vite.config.ts',
  {
    test: {
      name: 'cli',
      root: './packages/cli',
      include: ['src/**/*.test.ts'],
      environment: 'node',
      passWithNoTests: true,
    },
  },
]);
