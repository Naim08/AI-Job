import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    lib: {
      entry: 'src/preload.ts', // Or your actual preload script entry
      formats: ['cjs'],
      fileName: () => 'preload.js'
    },
    rollupOptions: {
      external: [
        'electron',
        /^node:.*/
      ]
    },
    outDir: '.vite/build', 
    emptyOutDir: false, // Important: set to false if main process builds to same dir first
  }
}); 