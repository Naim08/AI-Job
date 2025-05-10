import { defineConfig } from 'vite';
import tailwindcss from "@tailwindcss/vite";


// https://vitejs.dev/config
export default defineConfig({
  plugins: [
    tailwindcss(),
  ],
  // Explicitly set the root of your project if your index.html is there.
  // Vite defaults to `process.cwd()` which is usually correct, but being explicit can help.
  root: process.cwd(), 
  // For Electron Forge Vite plugin, often you don't need to specify build.rollupOptions.input.index here,
  // as it defaults to serving index.html from the root for the renderer in dev mode.
  // If you have a specific renderer entry JS/TS file, you would configure it here for the build.
  server: {
    // Configuration for the Vite dev server
    // port: 3000, // Optional: specify a port if needed, though Forge plugin usually handles this
    // open: false, // Optional: prevent Vite from opening the browser automatically
  },
  build: {
    rollupOptions: {
      // Point to your main HTML file as the input for the renderer build/dev
      input: 'index.html', 
    },
    // The default outDir for the renderer is usually fine when used with Electron Forge Vite plugin,
    // as the plugin manages output paths (e.g., .vite/renderer/main_window)
    // outDir: 'dist/renderer', // Only if you need to override
  }
}); 