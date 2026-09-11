#!/usr/bin/env node
/**
 * OperStack audit generator.
 *
 *   operstack-audit collect https://example.com [--pages 20] [--out audit.json]
 *       fetches the public signals (robots, sitemaps, llms.txt, sampled pages) and writes
 *       audit.json with every technical row filled and the narrative fields left for the analyst
 *   operstack-audit render audit.json [--out report.html] [--pdf]
 *       renders the report from the JSON; --pdf also prints a PDF with headless Chrome
 *   operstack-audit check audit.json
 *       lists narrative fields still holding placeholders and any score the checks do not support
 *
 * Scores are never typed by hand: the report always prints what the collected checks give,
 * and an area with no checks is printed as "not measured" rather than scored low.
 */
import { collect, verifyScores } from '../src/collect.mjs';
import { render, checkNarrative } from '../src/render.mjs';
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [cmd, target, ...rest] = process.argv.slice(2);
const opt = (k, d) => { const i = rest.indexOf(k); return i === -1 ? d : rest[i + 1]; };
const has = (k) => rest.includes(k);

if (!cmd || cmd === '--help' || cmd === '-h') {
  console.log('Usage:\n  operstack-audit collect <url> [--pages 20] [--out audit.json]\n  operstack-audit render <audit.json> [--out report.html] [--pdf]\n  operstack-audit check <audit.json>');
  process.exit(cmd ? 0 : 2);
}
if (cmd === 'collect') {
  if (!/^https?:\/\//.test(target || '')) { console.error('collect needs an absolute URL'); process.exit(2); }
  const audit = await collect(target, { pages: Number(opt('--pages', 20)), log: (m) => console.error(`  ${m}`) });
  const out = resolve(opt('--out', 'audit.json'));
  writeFileSync(out, JSON.stringify(audit, null, 2));
  console.log(`wrote ${out}: ${audit.checks.length} checks, ${audit.sample.length} pages sampled, scores ${Object.entries(audit.scores).map(([k, v]) => `${k} ${v === null ? 'not measured' : v}`).join(', ')}`);
  console.log(`next: fill the narrative fields (operstack-audit check ${out} lists them), then render.`);
} else if (cmd === 'render') {
  const audit = JSON.parse(readFileSync(resolve(target), 'utf8'));
  const out = resolve(opt('--out', target.replace(/\.json$/, '') + '.html'));
  const drift = verifyScores(audit);
  if (drift.length) { for (const d of drift) console.error(`score ignored, ${d}`); console.error('the report prints the score the checks give, not the one stored in the JSON.'); }
  const { html, pdf } = await render(audit, { out, pdf: has('--pdf') });
  console.log(`wrote ${out} (${html.length} bytes)${pdf ? `\nwrote ${pdf}` : ''}`);
  const missing = checkNarrative(audit);
  if (missing.length) console.log(`note: ${missing.length} narrative field(s) still carry placeholders: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ', ...' : ''}`);
} else if (cmd === 'check') {
  const audit = JSON.parse(readFileSync(resolve(target), 'utf8'));
  const missing = checkNarrative(audit);
  const drift = verifyScores(audit);
  if (missing.length) { console.log(`${missing.length} field(s) to write:`); for (const m of missing) console.log(`  ${m}`); }
  if (drift.length) { console.log(`${drift.length} score(s) that no check supports:`); for (const d of drift) console.log(`  ${d}`); }
  if (!missing.length && !drift.length) console.log('every narrative field is written and every score matches its checks');
  else process.exit(1);
} else { console.error(`unknown command ${cmd}`); process.exit(2); }
