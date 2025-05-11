import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    // Ensure .ts files are resolved
    extensions: ['.mjs', '.js', '.ts', '.json'],
  },
  build: {
    // Remove the `lib` section if `rollupOptions` is comprehensive enough
    // lib: { 
    //   entry: 'src/preload.ts', // This was potentially conflicting
    //   formats: ['cjs'],
    //   fileName: () => 'preload.js'
    // },
    rollupOptions: {
      input: {
        // Define a named entry, which helps ensure it's processed as a main entry
        preload: 'electron/preload.ts', // Use your correct path to the actual preload script
      },
      output: {
        format: 'cjs',
        // Output to the directory specified by outDir, with the [name] placeholder
        // This will become 'preload.js' due to the input key name
        entryFileNames: '[name].js', 
        // If you want to ensure it's always 'preload.js' regardless of input key name:
        // entryFileNames: 'preload.js',
        
        // It's good practice to put preload scripts in their own subdirectory within outDir
        // if not handled by forge, but for now let's keep it simple:
        // dir: '.vite/build/preload', // This would output to .vite/build/preload/preload.js
      },
      external: ['electron'],
    },
    outDir: '.vite/build', // Output directory
    emptyOutDir: false,    // Avoid clearing if other processes write here (like main process)
    minify: false,         // Useful to disable minification for debugging preload/main
  }
}); 