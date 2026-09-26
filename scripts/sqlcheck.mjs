#!/usr/bin/env node
/**
 * Syntax-checks migration files with PostgreSQL's own parser (libpg_query):
 * every statement, every PL/pgSQL body, and every `language sql` body.
 * Column names and types are NOT checked — this catches what a typo would
 * otherwise reveal halfway through `supabase db push`.
 *
 *   npm i -D libpg-query
 *   node scripts/sqlcheck.mjs supabase/migrations/2026092409*.sql
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pg = require('libpg-query');

function sqlFunctionBodies(tree) {
  const bodies = [];
  for (const { stmt } of tree.stmts ?? []) {
    const fn = stmt?.CreateFunctionStmt;
    if (!fn) continue;
    const options = Object.fromEntries((fn.options ?? []).map((option) => [option.DefElem.defname, option.DefElem.arg]));
    const language = options.language?.String?.sval;
    const body = options.as?.List?.items?.[0]?.String?.sval;
    if (language === 'sql' && body) bodies.push({ name: fn.funcname.map((part) => part.String.sval).join('.'), body });
  }
  return bodies;
}

if (pg.loadModule) await pg.loadModule();
let failed = 0;
for (const file of process.argv.slice(2)) {
  const sql = readFileSync(file, 'utf8');
  try {
    const tree = await pg.parse(sql);
    const plpgsql = /language\s+plpgsql|do\s+\$/i.test(sql) ? (await pg.parsePlPgSQL(sql))?.plpgsql_funcs?.length ?? 0 : 0;
    const bodies = sqlFunctionBodies(tree);
    for (const { name, body } of bodies) {
      try {
        await pg.parse(body);
      } catch (error) {
        failed += 1;
        console.log(`FAIL ${basename(file)} :: body of ${name}: ${error.message}`);
      }
    }
    console.log(`ok   ${basename(file)}: ${tree.stmts.length} statements, ${plpgsql} PL/pgSQL bodies, ${bodies.length} SQL bodies`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${basename(file)}: ${error.message}`);
  }
}
process.exit(failed ? 1 : 0);
