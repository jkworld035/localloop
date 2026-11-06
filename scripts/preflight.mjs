#!/usr/bin/env node
// Release preflight: run before every production build.
//   pnpm preflight
// Fails on anything that would ship a broken or non-compliant release.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const problems = [];
const warnings = [];
const run = (name, cmd) => {
  process.stdout.write(`• ${name} … `);
  try {
    execSync(cmd, { stdio: 'pipe' });
    console.log('ok');
  } catch (e) {
    console.log('FAILED');
    problems.push(`${name}:\n${String(e.stdout ?? '').slice(-1500)}${String(e.stderr ?? '').slice(-1500)}`);
  }
};

run('Typecheck (all apps)', 'pnpm -r typecheck');
run('Unit tests (incl. Telugu translations complete)', 'pnpm test:unit');

// Legal pages must name the real business before the stores see them.
const legal = readFileSync('packages/shared/src/legal/index.ts', 'utf8');
const entity = legal.slice(legal.indexOf('export const LEGAL_ENTITY'), legal.indexOf('} as const;'));
const unfilled = [...entity.matchAll(/(\w+): '[^']*\[[^\]]+\][^']*'/g)].map((m) => m[1]);
if (unfilled.length) problems.push(`Legal details not filled in (packages/shared/src/legal/index.ts → LEGAL_ENTITY): ${unfilled.join(', ')}`);

const config = readFileSync('apps/mobile/app.config.ts', 'utf8');
const version = config.match(/version: '([^']+)'/)?.[1];
console.log(`• App version ${version}`);
if (!process.env.GOOGLE_MAPS_ANDROID_API_KEY)
  warnings.push('GOOGLE_MAPS_ANDROID_API_KEY is not set here — fine if it is set in the EAS "production" environment (eas env:list --environment production).');

for (const w of warnings) console.log(`\n⚠ ${w}`);
if (problems.length) {
  console.error(`\n✖ ${problems.length} problem(s) — fix before building for the stores:\n`);
  for (const p of problems) console.error(`- ${p}\n`);
  process.exit(1);
}
console.log('\n✔ Ready for a production build: eas build --platform android --profile production');
