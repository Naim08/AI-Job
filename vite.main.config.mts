import { defineConfig } from "vite";
import commonjs from "@rollup/plugin-commonjs"; // Import the commonjs plugin

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    // Ensure .ts files are resolved
    extensions: [".mjs", ".js", ".ts", ".json"],
  },
  // No specific plugins needed for main process in this basic setup
  // Build options are typically handled by Electron Forge plugin referring to this file
  // For main process, ensure build targets CommonJS if not overridden by electron-vite plugin
  build: {
    lib: {
      entry: "electron/main.ts", // CORRECTED: Point to the main.ts in the electron directory
      formats: ["cjs"],
      fileName: () => "main.cjs", // Output filename
    },
    rollupOptions: {
      external: [
        "electron",
        /^node:.*/, // Exclude Node.js built-in modules
        /\.node$/, // Exclude ALL .node native modules
        "agentkeepalive",
        "@langchain/openai",
        "node-schedule",
        "keytar",
        "keytar/build/Release/keytar.node",
        "playwright",
        "playwright-core",
        // Playwright/Chromium-BiDi problematic modules
        "chromium-bidi/lib/cjs/bidiMapper/BidiMapper",
        "chromium-bidi/lib/cjs/cdp/CdpConnection",
        "canvas", // No longer needed
        "pdfjs-dist", // No longer needed
        "pdfjs-dist/legacy/build/pdf.js",
        "pdfjs-dist/legacy/build/pdf.worker.js",
      ],
      plugins: [
        // commonjs plugin might still be needed for other CJS modules.
        // If it was *only* for pdf-parse, and pdf-parse is removed,
        // and no other CJS modules cause issues, this could be removed entirely.
        // For now, keeping it general or empty if no specific rules are left.
        commonjs({
          dynamicRequireTargets: [
            // Add paths that need dynamic requires
            "node_modules/pdfjs-dist/**/*.js",
          ],
          // You can add rules for other CJS dependencies here if necessary.
        }),
      ],
    },
    outDir: ".vite/build", // Output directory
    emptyOutDir: false, // Set to false. Electron Forge plugin should handle cleaning.
    minify: false, // Disable minification for easier debugging
  },
});
