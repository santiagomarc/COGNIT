#!/usr/bin/env node
/**
 * WCAG contrast gate for the design tokens (improvement plan §2.10, UX-01).
 *
 * Reads the light (:root) and dark (.dark) token blocks from globals.css and
 * checks every text ink against every plane it can be printed on, and every
 * control edge against the same planes. Fails (exit 1) on any regression so a
 * token edit cannot quietly drop below AA on a plane nobody measured.
 *
 *   text  : ink, ink-dim, ink-dimmer      ≥ 4.5 (AA, normal text)
 *   edges : border-control                ≥ 3.0 (1.4.11 non-text)
 *   planes: bg, surface, surface-raised, raised-bg, recess
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const css = readFileSync(path.join(here, '..', 'src', 'app', 'globals.css'), 'utf8');

const TEXT_TOKENS = ['ink', 'ink-dim', 'ink-dimmer'];
const EDGE_TOKENS = ['border-control'];
const PLANES = ['bg', 'surface', 'surface-raised', 'raised-bg', 'recess'];

function block(selectorRegex) {
  const match = css.match(selectorRegex);
  if (!match) throw new Error(`Could not find block ${selectorRegex}`);
  return match[1];
}

// :root { … } that contains --bg (the light theme); .dark { … } for dark.
const light = block(/:root\s*\{([^}]*--bg:[^}]*)\}/);
const dark = block(/\.dark\s*\{([^}]*--bg:[^}]*)\}/);

function token(source, name) {
  const match = source.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`Token --${name} not found`);
  return match[1];
}

function luminance(hex) {
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

let failures = 0;
for (const [theme, source] of [['light', light], ['dark', dark]]) {
  for (const plane of PLANES) {
    const planeHex = token(source, plane);
    for (const [tokens, floor, label] of [[TEXT_TOKENS, 4.5, 'text'], [EDGE_TOKENS, 3.0, 'edge']]) {
      for (const name of tokens) {
        const value = ratio(token(source, name), planeHex);
        const ok = value >= floor;
        if (!ok) failures += 1;
        const line = `${ok ? 'ok  ' : 'FAIL'} ${theme.padEnd(5)} ${label} --${name.padEnd(15)} on --${plane.padEnd(15)} ${value.toFixed(2)}:1 (≥ ${floor})`;
        if (!ok || process.argv.includes('--verbose')) console.log(line);
      }
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} contrast pair(s) below the floor.`);
  process.exit(1);
}
console.log('contrast: every ink/edge token clears its floor on every plane in both themes.');
