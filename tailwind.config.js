/** @type {import('tailwindcss').Config} */
module.exports = {
  // For Tailwind CSS v4, content scanning is automatic.
  // Theme configuration and specific DaisyUI theme settings will be handled in CSS via @plugin directive.
  theme: {
    extend: {},
  },
  plugins: [
    require('daisyui'), // Register DaisyUI plugin
  ],
  // The daisyui object for themes (e.g., themes: ["dark"]) is removed
  // as per daisyUI v5 with Tailwind v4 guidelines, this is handled in CSS.
}; 