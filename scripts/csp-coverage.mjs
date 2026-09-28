#!/usr/bin/env node
/**
 * Does the page's strict CSP cover every script it ships? Fetches the URL,
 * finds the nonce policy (enforcing or report-only), and checks each
 * <script>: allowed if it carries that nonce, or if it is inline and its
 * SHA-256 is listed. Exit 1 on any uncovered script.
 *
 *   node scripts/csp-coverage.mjs https://<host>/s/<token>
 *   COOKIE="$(node --env-file=.env.local scripts/k6-session.mjs)" node scripts/csp-coverage.mjs https://<host>/dashboard
 */
import { createHash } from 'node:crypto';

const url = process.argv[2];
const response = await fetch(url, { redirect: 'manual', headers: process.env.COOKIE ? { cookie: process.env.COOKIE } : {} });
const html = await response.text();
const policies = [...response.headers.entries()].filter(([name]) => name.startsWith('content-security-policy'));
for (const [name, value] of policies) console.log(`${name}: ${value.slice(0, 110)}…`);

// The strict policy is the one with 'strict-dynamic'; during the report-only
// week the enforced bridge policy carries the same nonce (src/lib/csp.ts).
const strict = policies.map(([, value]) => value).find((value) => value.includes("'strict-dynamic'"));
if (!strict) {
  console.error(`No nonce policy on ${url} (status ${response.status}).`);
  process.exit(1);
}
const nonce = strict.match(/'nonce-([^']+)'/)?.[1];
const hashes = [...strict.matchAll(/'sha256-([^']+)'/g)].map((match) => match[1]);
const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
const uncovered = scripts.filter(([, attributes, body]) => {
  if (attributes.match(/nonce="([^"]+)"/)?.[1] === nonce) return false;
  return /\bsrc=/.test(attributes) || !hashes.includes(createHash('sha256').update(body).digest('base64'));
});
console.log(`${scripts.length - uncovered.length}/${scripts.length} scripts covered by the strict policy`);
for (const [, attributes, body] of uncovered) console.log(`  ✗ <script${attributes.slice(0, 80)}> ${body.slice(0, 60)}`);
process.exit(uncovered.length ? 1 : 0);
