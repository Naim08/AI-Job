import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  // No specific plugins needed for main process in this basic setup
  // Build options are typically handled by Electron Forge plugin referring to this file
  // For main process, ensure build targets CommonJS if not overridden by electron-vite plugin
  build: {
    lib: {
      entry: 'src/main.ts', // Or your actual main process entry
      formats: ['cjs'],
      fileName: () => 'main.cjs'
    },
    rollupOptions: {
      external: [
        'electron',
        /^node:.*/
      ]
    },
    outDir: '.vite/build',
    emptyOutDir: true, // Usually true for the first build step
  }
}); 