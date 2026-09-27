/**
 * A no-op stand-in for the `server-only` package, used ONLY by the test run.
 *
 * WHY THIS FILE IS IN THE REPOSITORY
 *
 * Server modules start with `import "server-only"`, which is what stops them
 * being pulled into a client bundle by accident. The real package throws the
 * moment it is imported outside a React Server Component, so a plain Node test
 * cannot import any of those modules — and `tests/product-intel-ai.test.ts`
 * needs to, because the AI boundary it checks lives in one of them.
 *
 * This used to work by way of a hand-written file dropped inside
 * `node_modules/server-only/`. That file was in nobody's package.json, so the
 * next `npm install` deleted it and the AI tests stopped running — which is
 * exactly what happened during this audit, and would have happened on any
 * fresh checkout or CI machine without anyone noticing why.
 *
 * `tsconfig.test.json` maps `server-only` here. Next.js never reads that
 * config, so the real guard still protects the application build.
 */
export {};
