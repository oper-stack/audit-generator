#!/usr/bin/env node
/** Живая сверка: балл движка и балл, который кладёт в отчёт сборщик, на одном и том же сайте.
 *  Нужна сеть, поэтому отдельно от npm test. Запуск: node src/verify-live.mjs <адрес> [ещё...] */
import { collect } from './collect.mjs';
import { checkVisibility, VISIBILITY_DEFAULTS } from './visibility.mjs';

const sites = process.argv.slice(2);
if (!sites.length) { console.error('укажите хотя бы один адрес'); process.exit(2); }
let bad = 0;
for (const site of sites) {
  for (const lang of ['en', 'ru']) {
    const direct = await checkVisibility(site, { ...VISIBILITY_DEFAULTS, lang });
    const audit = await collect(site, { pages: 5, lang, log: () => {} });
    const a = direct.ok ? direct.score : null;
    const b = audit.overall.score;
    const same = a === b;
    if (!same) bad++;
    const sum = (audit.overall.areas || []).reduce((s, x) => s + x.score, 0);
    console.log(`${same ? 'ok  ' : 'FAIL'} ${site} [${lang}] движок ${a} | отчёт ${b} | сумма областей ${audit.overall.areas?.length ? sum : '-'} | ${audit.overall.grade}`);
  }
}
if (bad) { console.error(`\n${bad} расхождений`); process.exit(1); }
console.log('\nбалл совпадает везде');
