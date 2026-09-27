#!/usr/bin/env node
/**
 * Per-route first-load JavaScript from a Next 16 (Turbopack) build: the root
 * main files plus every chunk in the route's client-reference manifest,
 * deduplicated, raw and gzip. Next 16 no longer prints sizes; this does.
 *
 *   node scripts/bundle-report.mjs .next
 *   node scripts/bundle-report.mjs .next --budgets scripts/bundle-budgets.json   # exit 1 on any overrun
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import vm from 'node:vm';

const NEXT = process.argv[2] ?? '.next';
const budgetsFlag = process.argv.indexOf('--budgets');
const budgets = budgetsFlag > 0 ? JSON.parse(readFileSync(process.argv[budgetsFlag + 1], 'utf8')) : null;

const build = JSON.parse(readFileSync(join(NEXT, 'build-manifest.json'), 'utf8'));
const sizes = new Map();
function size(file) {
  if (!sizes.has(file)) {
    const buffer = readFileSync(join(NEXT, file));
    sizes.set(file, { raw: buffer.length, gz: gzipSync(buffer, { level: 9 }).length });
  }
  return sizes.get(file);
}

function manifests(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) manifests(path, out);
    else if (entry === 'page_client-reference-manifest.js') out.push(path);
  }
  return out;
}

const rows = [];
for (const file of manifests(join(NEXT, 'server/app'))) {
  const context = { globalThis: {} };
  vm.runInNewContext(readFileSync(file, 'utf8'), context);
  for (const [route, data] of Object.entries(context.globalThis.__RSC_MANIFEST ?? {})) {
    const files = new Set(build.rootMainFiles);
    for (const list of Object.values(data.entryJSFiles ?? {})) for (const chunk of list) files.add(chunk);
    let raw = 0;
    let gz = 0;
    for (const chunk of files) {
      if (!existsSync(join(NEXT, chunk))) continue;
      const s = size(chunk);
      raw += s.raw;
      gz += s.gz;
    }
    rows.push({ route, chunks: files.size, raw, gz });
  }
}

rows.sort((a, b) => b.gz - a.gz);
let over = 0;
console.log(`${'route'.padEnd(46)} ${'chunks'.padStart(6)} ${'raw kB'.padStart(8)} ${'gz kB'.padStart(7)}${budgets ? '  budget' : ''}`);
for (const row of rows) {
  const budget = budgets?.[row.route];
  const gzKb = row.gz / 1024;
  const verdict = budget === undefined ? '' : gzKb <= budget ? `  ≤ ${budget} ✓` : `  > ${budget} ✗`;
  if (budget !== undefined && gzKb > budget) over += 1;
  console.log(`${row.route.padEnd(46)} ${String(row.chunks).padStart(6)} ${(row.raw / 1024).toFixed(0).padStart(8)} ${gzKb.toFixed(1).padStart(7)}${verdict}`);
}
if (budgets) {
  const unknown = Object.keys(budgets).filter((route) => !rows.some((row) => row.route === route));
  for (const route of unknown) console.error(`budget names an unknown route: ${route}`);
  if (over > 0 || unknown.length > 0) {
    console.error(`\n${over} route(s) over budget.`);
    process.exit(1);
  }
  console.log('\nAll routes within budget.');
}
