#!/usr/bin/env node
/**
 * OperStack audit generator.
 *
 *   operstack-audit collect https://example.com [--pages 20] [--out audit.json] [--backlinks links.json] [--lang ru]
 *       fetches the public signals (robots, sitemaps, llms.txt, sampled pages) and writes
 *       audit.json with every technical row filled and the narrative fields left for the analyst
 *   operstack-audit render audit.json [--out report.html] [--pdf]
 *       renders the report from the JSON; --pdf also prints a PDF with headless Chrome
 *   operstack-audit fix-plan audit.json [--platform files|cms] [--lang ru|en] [--price 249]
 *       the list of checks the Fix package closes on this site, a letter for the client and a checklist
 *       in the buyer's language; the price defaults to 249 USD in English and 21000 RUB in Russian
 *   operstack-audit fix-report audit-fix-plan.json after.json
 *       what was closed, what was not, and how much to refund
 *   operstack-audit foundation-scope audit.json [--lang ru|en] [--new-pages 3] [--gsc]
 *       the text work the Foundation package would do, page by page, with the price it adds up to
 *   operstack-audit draft audit.json [--lang ru|en] [--out audit.json]
 *       fills the narrative fields from the checks so the analyst edits instead of writing
 *   operstack-audit prompts audit.json [--lang ru|en] [--limit 3] [--out prompts.md]
 *       every finding rewritten as a task an AI agent can execute
 *   operstack-audit check audit.json
 *       lists narrative fields still holding placeholders and any score the checks do not support
 *
 * Scores are never typed by hand: the report always prints what the collected checks give,
 * and an area with no checks is printed as "not measured" rather than scored low.
 */
import { collect, verifyScores } from '../src/collect.mjs';
import { buildFixPlan, renderFixPlan, renderFixChecklist, buildFixReport, renderFixReport } from '../src/fix.mjs';
import { buildFoundationScope, renderFoundationScope, renderFoundationChecklist } from '../src/foundation.mjs';
import { draftNarrative, stillEmpty } from '../src/narrative.mjs';
import { renderAgentPrompts, agentPrompts } from '../src/prompts.mjs';
import { render, checkNarrative } from '../src/render.mjs';
import { resolveBranding } from '../src/agency.mjs';
import { readList, runBatch, summarise } from '../src/batch.mjs';
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [cmd, target, ...rest] = process.argv.slice(2);
const opt = (k, d) => { const i = rest.indexOf(k); return i === -1 ? d : rest[i + 1]; };
const has = (k) => rest.includes(k);

if (!cmd || cmd === '--help' || cmd === '-h') {
  console.log([
    'Usage:',
    '  operstack-audit collect <url> [--pages 20] [--out audit.json] [--lang ru] [--no-rendered]',
    '      collect the public signals of a site into audit.json; a real browser also measures how',
    '      much of the text is invisible without JavaScript (--no-rendered skips that)',
    '  operstack-audit render <audit.json> [--out report.html] [--pdf]',
    '      render the report; --pdf also prints a PDF with headless Chrome',
    '  operstack-audit draft <audit.json> [--lang ru|en] [--out audit.json]',
    '      fill the narrative from the checks: the analyst edits a draft instead of writing one',
    '  operstack-audit prompts <audit.json> [--lang ru|en] [--limit 3] [--out prompts.md]',
    '      every finding rewritten as a task you can paste into Cursor or Claude Code',
    '  operstack-audit check <audit.json>',
    '      list narrative fields still holding placeholders and any score the checks do not support',
    '',
    '  operstack-audit fix-plan <audit.json> [--platform files|cms] [--lang ru|en] [--price 249] [--out base]',
    '      what the Fix package closes on this site: plan, client letter, executor checklist',
    '  operstack-audit fix-report <audit-fix-plan.json> <after.json> [--out report.md]',
    '      what was closed, what was not, and how much to refund',
    '  operstack-audit foundation-scope <audit.json> [--lang ru|en] [--new-pages 3] [--gsc] [--price] [--out base]',
    '      the text work the Foundation package would do, page by page; --price also states the money',
    '',
    '  operstack-audit batch <sites.txt> [--out reports] [--pages 12] [--lang en|ru] [--pdf] [brand flags]',
    '      one report per line of the list; a line is "url" or "url, Client Name"',
    '',
    '  White label:',
    '    --by "Agency Name"        who the report says prepared it; also OPERSTACK_PREPARED_BY',
    '                              works on collect and on render, so an existing audit can be re-signed',
    '    --recheck-url <url>       where the fix report sends the client to re-check',
    '                              with --by set to someone other than us and no url, the line is omitted',
    '',
    '  Agency plan (needs a licence key, https://oper-stack.com/products/agency/):',
    '    --logo <file>             svg, png, jpg or webp on the cover, embedded in the PDF',
    '    --color <hex>             replaces the report accent colour, six hex digits',
    '    --no-tool-line            drops the line naming the tool that collected the signals',
    '    --licence <key>           OSK1 key; also OPERSTACK_LICENCE or a .operstack-licence file',
  ].join('\n'));
  process.exit(cmd ? 0 : 2);
}
if (cmd === 'collect') {
  if (!/^https?:\/\//.test(target || '')) { console.error('collect needs an absolute URL'); process.exit(2); }
  const backlinksFile = opt('--backlinks', '');
  const backlinks = backlinksFile ? JSON.parse(readFileSync(resolve(backlinksFile), 'utf8')) : null;
  // Проверка «виден ли текст без скриптов» требует браузера и добавляет полминуты на страницу.
  // В платном аудите она нужна всегда: именно здесь мы можем соврать про чужой сайт. Выключается
  // флагом --no-rendered, например когда браузера нет или прогон идёт по расписанию.
  const audit = await collect(target, {
    pages: Number(opt('--pages', 20)), backlinks, lang: opt('--lang', 'en'),
    rendered: !has('--no-rendered'), renderedPages: Number(opt('--rendered-pages', 3)),
    preparedBy: opt('--by', ''),
    log: (m) => console.error(`  ${m}`),
  });
  const out = resolve(opt('--out', 'audit.json'));
  writeFileSync(out, JSON.stringify(audit, null, 2));
  console.log(`wrote ${out}: ${audit.checks.length} checks, ${audit.sample.length} pages sampled, scores ${Object.entries(audit.scores).map(([k, v]) => `${k} ${v === null ? 'not measured' : v}`).join(', ')}`);
  console.log(`next: fill the narrative fields (operstack-audit check ${out} lists them), then render.`);
} else if (cmd === 'batch') {
  const brand = brandFrom(opt, has);
  const items = readList(target);
  if (!items.length) { console.error('the list is empty'); process.exit(2); }
  console.error(`${items.length} site(s) to audit`);
  const results = await runBatch(items, {
    outDir: opt('--out', 'reports'), pages: Number(opt('--pages', 12)), lang: opt('--lang', 'en'),
    brand, pdf: has('--pdf'), log: (m) => console.error(`  ${m}`),
  });
  console.log(summarise(results));
  if (!results.some((r) => r.ok)) process.exit(1);
} else if (cmd === 'render') {
  const audit = JSON.parse(readFileSync(resolve(target), 'utf8'));
  const by = opt('--by', '');
  if (by) audit.client = { ...(audit.client || {}), preparedBy: by };
  const out = resolve(opt('--out', target.replace(/\.json$/, '') + '.html'));
  const drift = verifyScores(audit);
  if (drift.length) { for (const d of drift) console.error(`score ignored, ${d}`); console.error('the report prints the score the checks give, not the one stored in the JSON.'); }
  const { html, pdf } = await render(audit, { out, pdf: has('--pdf'), brand: brandFrom(opt, has) });
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
} else if (cmd === 'draft') {
  const audit = JSON.parse(readFileSync(resolve(target), 'utf8'));
  const before = stillEmpty(audit).length;
  const drafted = draftNarrative(audit, { lang: opt('--lang', audit.meta?.lang || 'en') });
  const after = stillEmpty(drafted);
  const out = resolve(opt('--out', target));
  writeFileSync(out, JSON.stringify(drafted, null, 2));
  console.log(`${before} field(s) were empty, ${after.length} left`);
  if (after.length) for (const f of after) console.log(`  still yours to write: ${f}`);
  console.log(`wrote ${out}`);
  console.log('read it before sending: the draft states only what was measured, and says so where nothing was.');
} else if (cmd === 'prompts') {
  const audit = JSON.parse(readFileSync(resolve(target), 'utf8'));
  const lang = opt('--lang', audit.meta?.lang || 'en');
  const limit = Number(opt('--limit', 0));
  const list = agentPrompts(audit, { lang, limit });
  const out = resolve(opt('--out', target.replace(/\.json$/, '') + '-prompts.md'));
  writeFileSync(out, renderAgentPrompts(audit, { lang, limit }));
  console.log(`${list.length} task(s): ${list.filter((x) => x.hasOwnText).length} written for that finding, ${list.filter((x) => !x.hasOwnText).length} generic`);
  console.log(`wrote ${out}`);
} else if (cmd === 'fix-plan') {
  const audit = JSON.parse(readFileSync(resolve(target), 'utf8'));
  // Язык покупки решает и валюту, и письмо: за доллары платят по английскому списку, за рубли по русскому.
  const lang = opt('--lang', 'ru') === 'en' ? 'en' : 'ru';
  const plan = buildFixPlan(audit, {
    platform: opt('--platform', 'files'),
    lang,
    price: Number(opt('--price', lang === 'en' ? 249 : 21000)),
    currency: opt('--currency', lang === 'en' ? 'USD' : 'RUB'),
    recheckUrl: opt('--recheck-url', ''),
  });
  if (plan.langMismatch) { console.error(`this audit was collected in Russian: an English letter would carry Russian check names. Re-run: operstack-audit collect <site> --lang en`); process.exit(1); }
  if (plan.unknown.length) console.error(`note: ${plan.unknown.length} check(s) have no fix action yet: ${plan.unknown.join(', ')}`);
  const base = opt('--out', target.replace(/\.json$/, ''));
  writeFileSync(resolve(`${base}-fix-plan.json`), JSON.stringify(plan, null, 2));
  writeFileSync(resolve(`${base}-fix-letter.md`), renderFixPlan(plan));
  writeFileSync(resolve(`${base}-fix-checklist.md`), renderFixChecklist(plan));
  console.log(`${plan.included.length} check(s) we close, ${plan.needsClient.length} need the client's facts, ${plan.notPossible.length} not promised`);
  console.log(`share per check ${plan.share} ${plan.currency}`);
  console.log(`wrote ${base}-fix-plan.json, ${base}-fix-letter.md, ${base}-fix-checklist.md`);
} else if (cmd === 'fix-report') {
  const plan = JSON.parse(readFileSync(resolve(target), 'utf8'));
  const after = JSON.parse(readFileSync(resolve(rest[0]), 'utf8'));
  const report = buildFixReport(plan, after);
  const out = resolve(opt('--out', target.replace(/-fix-plan\.json$/, '') + '-fix-report.md'));
  writeFileSync(out, renderFixReport(report));
  console.log(`closed ${report.closed.length} of ${report.total}, still open ${report.stillOpen.length}, refund ${report.refund} ${report.currency}`);
  console.log(`wrote ${out}`);
} else if (cmd === 'foundation-scope') {
  const audit = JSON.parse(readFileSync(resolve(target), 'utf8'));
  const lang = opt('--lang', 'ru') === 'en' ? 'en' : 'ru';
  if (!(audit.sample || []).some((p) => p.answerFirst !== undefined)) {
    console.error('this audit was collected before the text fields were kept in the sample: re-run collect to scope Foundation');
    process.exit(1);
  }
  const scope = buildFoundationScope(audit, {
    lang,
    newPages: Number(opt('--new-pages', 0)),
    hasSearchConsole: has("--gsc"),
    withPrice: has('--price'),
    unit: opt('--unit') ? Number(opt('--unit')) : undefined,
    minimum: opt('--minimum') ? Number(opt('--minimum')) : undefined,
    currency: opt('--currency'),
  });
  const base = opt('--out', target.replace(/\.json$/, ''));
  writeFileSync(resolve(`${base}-foundation-scope.json`), JSON.stringify(scope, null, 2));
  writeFileSync(resolve(`${base}-foundation-letter.md`), renderFoundationScope(scope));
  writeFileSync(resolve(`${base}-foundation-checklist.md`), renderFoundationChecklist(scope));
  console.log(`${scope.pages.length} page(s) need text work of ${scope.sampledPages} sampled, ${scope.shares} share(s)`);
  if (scope.withPrice) console.log(`price ${scope.price} ${scope.currency}${scope.atMinimum ? ` (raw ${scope.raw}, lifted to the package minimum)` : ''}`);
  else console.log('no price in the letter: add --price once the list is agreed and you have decided what to charge');
  console.log(`wrote ${base}-foundation-scope.json, ${base}-foundation-letter.md, ${base}-foundation-checklist.md`);
} else { console.error(`unknown command ${cmd}`); process.exit(2); }

/** Оформление из флагов. Причины, по которым что-то не применилось, печатаются сразу: молча
 *  проигнорированный логотип выглядит как поломка продукта, а не как отсутствие лицензии. */
function brandFrom(opt, has) {
  const brand = resolveBranding({
    by: opt('--by', ''), logo: opt('--logo', ''), color: opt('--color', ''),
    licence: opt('--licence', ''), toolLine: !has('--no-tool-line'),
  });
  for (const n of brand.notes) console.error(`  ${n}`);
  if (brand.licensed) console.error(`  agency plan active${brand.licensee ? ` (${brand.licensee})` : ''}`);
  return brand;
}
