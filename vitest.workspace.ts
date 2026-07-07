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
  {
    test: {
      name: 'editor',
      root: './packages/editor',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      environment: 'jsdom',
      passWithNoTests: true,
    },
  },
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
