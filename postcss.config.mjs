/**
 * Tailwind CSS v4 uses a dedicated PostCSS plugin. No tailwind.config.js is
 * required — the design system is declared CSS-first inside src/app/globals.css
 * via the @theme directive (see the Enterprise Design Manual token layer).
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
