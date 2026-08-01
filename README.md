# AYZENITH

The digital headquarters of AYZENITH — an independent Türkiye-based B2B global
trade, sourcing, and investment group.

Trilingual marketing site (English · Türkçe · Deutsch) built with the Next.js
App Router, React Server Components, and a token-driven Tailwind design system.

## Tech stack

- **Framework:** Next.js (App Router, RSC-first)
- **Language:** TypeScript (strict)
- **Styling:** Tailwind CSS v4 (CSS-first `@theme`, three-tier design tokens)
- **i18n:** next-intl — `en` at `/`, `tr` at `/tr`, `de` at `/de`
- **Forms:** React Hook Form + Zod
- **Motion:** Framer Motion (reveal-on-scroll, reduced-motion aware)

## Local development

```bash
npm install
npm run dev      # http://localhost:3000
```

## Production

```bash
npm run build
npm run start
```

## Project structure

- `src/app/[locale]/` — locale-scoped routes (marketing pages, legal, error)
- `src/components/` — `ui/` primitives, `layout/`, `sections/`
- `src/i18n/` — routing, navigation, request config
- `src/config/` — site config, brand, assets
- `messages/` — `en.json`, `tr.json`, `de.json` translation catalogs

## Contact

info@ayzenith.com · Ataköy, Istanbul, Türkiye
