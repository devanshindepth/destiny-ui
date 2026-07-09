import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import path from 'path';

const preactCompatPath = path.resolve('./node_modules/preact/compat/dist/compat.module.js');
const preactJsxRuntimePath = path.resolve('./node_modules/preact/jsx-runtime/dist/jsxRuntime.module.js');

export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
      // Map react → preact/compat so zustand and @testing-library work in tests
      'react/jsx-runtime': preactJsxRuntimePath,
      'react/jsx-dev-runtime': preactJsxRuntimePath,
      'react-dom/test-utils': path.resolve('./node_modules/preact/test-utils/dist/testUtils.module.js'),
      'react-dom': preactCompatPath,
      react: preactCompatPath,
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    name: 'editor',
    root: './packages/editor',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    server: {
      deps: {
        // Force vitest to inline zustand so our react alias applies
        inline: ['zustand'],
      },
    },
  },
});
