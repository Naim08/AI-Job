/// <reference path="./types/electron.d.ts" />

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

// If these variables are only present in certain conditions (e.g., dev vs. prod),
// you might need to adjust their types, for example:
// declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;

// Adding a general global namespace augmentation for good measure, if needed later.
// declare global {
//   // example:
//   // var MyGlobalVariable: string;
// }

// This file can be used to declare global types or augment existing ones.
// For example, to add custom properties to the Window object:

// declare global {
//   interface Window {
//     myCustomProperty: string;
//   }
// }

// If you have types defined in .d.ts files within your project,
// ensure they are included in your tsconfig.json's "include" or "files" array.
// For example, if you have "src/types/electron.d.ts":
// "include": ["src/**/*.ts", "src/**/*.d.ts"] // or just "src/**/*"
