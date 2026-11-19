#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS hook script */
/**
 * Post-install hook — generates the Prisma client(s) required by the
 * DATABASE_URL of the target environment:
 *
 *   • always: the default SQLite client (`@prisma/client`, prisma/schema.prisma)
 *     — used for local dev / self-hosted / Turso deployments;
 *   • when DATABASE_URL points at Postgres (Supabase): the Postgres client
 *     generated from prisma/schema.postgres.prisma into src/generated/postgres.
 *
 * Both clients share the exact same model surface (45 tables, identical
 * columns), so `src/lib/db.ts` can pick either one at runtime with zero
 * application-code changes.
 */
const { execSync } = require('node:child_process')

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' })
}

/** Exécution avec tentatives : `prisma generate` télécharge les moteurs
 *  (binaries.prisma.sh) et échoue de façon TRANSITOIRE dans certains
 *  conteneurs de build Vercel (réseau capricieux) — sans retry, un déploie
 *  peut échouer sur un simple timeout de téléchargement (observé : builds
 *  dupliqués en ERROR « postinstall exited with 1 » puis retry réussi).
 *  3 tentatives avec délai croissant rendent le pipeline déterministe. */
function runRetry(cmd, tries = 3) {
  let lastErr
  for (let i = 1; i <= tries; i++) {
    try {
      run(cmd)
      return
    } catch (e) {
      lastErr = e
      console.warn(`⚠ postinstall: "${cmd}" a échoué (tentative ${i}/${tries})${i < tries ? ' — nouvelle tentative…' : ''}`)
      if (i < tries) execSync(`sleep ${i * 3}`, { stdio: 'inherit' })
    }
  }
  throw lastErr
}

function main() {
  const url = process.env.DATABASE_URL ?? ''

  // Default SQLite client (local dev + Turso-compatible deployments).
  runRetry('prisma generate')

  // Postgres client (Supabase production) — always generated when the target
  // is Postgres, and harmless to regenerate alongside SQLite for parity.
  if (/^postgres(ql)?:\/\//.test(url) || process.env.GENERATE_POSTGRES_CLIENT === '1') {
    runRetry('prisma generate --schema prisma/schema.postgres.prisma')
    console.log('→ Postgres client generated (src/generated/postgres)')
  }
}

main()
