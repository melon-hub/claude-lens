import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/renderer/index.html'),
    },
    // Handle CJS workspace packages properly
    // Use real paths (not symlinked) per @rollup/plugin-commonjs docs
    commonjsOptions: {
      include: [/node_modules/, /packages\/core/],
      transformMixedEsModules: true,
    },
  },
  // Pre-bundle @claude-lens/core to convert CJS to ESM
  optimizeDeps: {
    include: ['@claude-lens/core'],
  },
  server: {
    port: 5173,
    strictPort: true, // Fail if port is in use instead of silently using another
  },
  resolve: {
    // Resolve symlinks to real paths for proper CJS handling
    preserveSymlinks: true,
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
