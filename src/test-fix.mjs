#!/usr/bin/env node
/** Пакет Fix: раскладка проверок, доля возврата, отчёт о закрытии, два языка. */
import { buildFixPlan, renderFixPlan, renderFixChecklist, buildFixReport, renderFixReport, FIX_ACTIONS } from './fix.mjs';
import { readFileSync } from 'node:fs';

let bad = 0;
const is = (n, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { bad++; console.error(`FAIL ${n}\n  ждали ${JSON.stringify(b)}\n  вышло ${JSON.stringify(a)}`); } else console.log(`ok   ${n}`); };
const ok = (n, c) => is(n, Boolean(c), true);

const audit = (checks) => ({ meta: { host: 'x.ru', collectedAt: '2026-09-11T00:00:00.000Z' }, checks });
const c = (id, status, value = 'текст') => ({ id, status, value, label: id, group: 'technical' });

const many = audit([
  c('robots', 'bad'), c('sitemap', 'warn'), c('llms', 'bad'), c('og', 'warn'), c('canonical', 'warn'),
  c('trust-entity', 'warn'), c('conv-messenger', 'warn'),
  c('answer-first', 'warn'), c('sources', 'bad'),
  c('conv-form-depth', 'bad'),
  c('links-profile', 'warn'),
  c('https', 'ok'), c('viewport', 'ok'),
]);

const plan = buildFixPlan(many, { platform: 'files', price: 21000, currency: 'RUB' });
is('закрываем восемь', plan.included.length, 8);
is('фактов клиента требуют две', plan.needsClient.length, 2);
is('не обещаем одну', plan.notPossible.length, 1);
is('пройденные проверки в список не попадают', plan.included.some((x) => x.check.id === 'https'), false);
is('доля считается от числа включённых', plan.share, Math.round((21000 / 8) * 100) / 100);
ok('список не тонкий', !plan.thin);
ok('у каждой включённой проверки есть действие', plan.included.every((x) => typeof x.action === 'string' && x.action.length > 10));
ok('платные данные по ссылкам не обещаются', plan.notPossible.some((x) => x.check.id === 'links-profile'));

const cms = buildFixPlan(many, { platform: 'cms', price: 21000, currency: 'RUB' });
ok('на готовой CMS работа с исходниками не обещается', cms.notPossible.some((x) => x.check.id === 'conv-form-depth'));
is('и в список она не попадает', cms.included.some((x) => x.check.id === 'conv-form-depth'), false);
ok('доля на CMS выше, потому что работ меньше', cms.share > plan.share);

const thin = buildFixPlan(audit([c('og', 'warn'), c('canonical', 'warn')]), { price: 21000, currency: 'RUB' });
ok('тонкий список помечен', thin.thin);
ok('письмо про тонкий список говорит прямо', renderFixPlan(thin).includes('закрывать у вас почти нечего'));

const empty = buildFixPlan(audit([c('https', 'ok')]), { price: 21000 });
is('пустой список', empty.included.length, 0);
is('доля при пустом списке ноль', empty.share, 0);
ok('письмо говорит, что покупать нечего', renderFixPlan(empty).includes('Покупать нечего'));

const letter = renderFixPlan(plan);
ok('в письме есть цена и доля', letter.includes('21000 RUB') && letter.includes(String(plan.share)));
ok('в письме названо, что не входит', letter.includes('нужны ваши факты'));
ok('в чек-листе есть все включённые', plan.included.every((x) => renderFixChecklist(plan).includes(x.check.label)));

// Язык. Покупка за доллары не должна приходить письмом по-русски. Названия и значения проверок
// приходят из сборщика уже на языке аудита, поэтому и фикстура здесь английская.
const ce = (id, status, value = 'plain text') => ({ id, status, value, label: id, group: 'technical' });
const manyEn = { meta: { host: 'x.com', collectedAt: '2026-09-11T00:00:00.000Z' }, checks: many.checks.map((x) => ce(x.id, x.status)) };
const en = buildFixPlan(manyEn, { platform: 'files', price: 249, lang: 'en' });
is('валюта по умолчанию для английского', en.currency, 'USD');
is('валюта по умолчанию для русского', buildFixPlan(many, { price: 21000 }).currency, 'RUB');
is('раскладка от языка не зависит', [en.included.length, en.needsClient.length, en.notPossible.length], [8, 2, 1]);
const letterEn = renderFixPlan(en);
ok('английское письмо без кириллицы', !/[А-Яа-яЁё]/.test(letterEn));
ok('английский чек-лист без кириллицы', !/[А-Яа-яЁё]/.test(renderFixChecklist(en)));
ok('в английском письме есть цена', letterEn.includes('249 USD'));
const thinEn = buildFixPlan({ meta: { host: 'x.com' }, checks: [ce('og', 'warn')] }, { price: 249, lang: 'en' });
ok('английское предупреждение о тонком списке', renderFixPlan(thinEn).includes('little here to fix'));
ok('единственное число по-английски', renderFixPlan(thinEn).includes('1 check at'));

const after = audit([
  c('robots', 'ok', 'починено'), c('sitemap', 'ok', 'починено'), c('llms', 'ok', 'починено'),
  c('og', 'ok', 'починено'), c('canonical', 'ok', 'починено'), c('trust-entity', 'ok', 'починено'),
  c('conv-messenger', 'warn', 'так и не сделали'), c('conv-form-depth', 'ok', 'починено'),
]);
const rep = buildFixReport(plan, after);
is('закрыто семь', rep.closed.length, 7);
is('осталось одно', rep.stillOpen.length, 1);
is('возврат равен доле одной проверки', rep.refund, plan.share);
is('незакрытой осталась именно та проверка', rep.stillOpen[0].check.id, 'conv-messenger');
ok('в отчёте она названа', renderFixReport(rep).includes(rep.stillOpen[0].check.label));
ok('в отчёте есть сумма возврата', renderFixReport(rep).includes(String(rep.refund)));
ok('английский отчёт без кириллицы', !/[А-Яа-яЁё]/.test(renderFixReport(buildFixReport(en, { checks: [] }))));

const repAll = buildFixReport(buildFixPlan(audit([c('robots', 'bad')]), { price: 249 }), audit([c('robots', 'ok')]));
is('всё закрыто, возврата нет', repAll.refund, 0);
ok('отчёт так и говорит', renderFixReport(repAll).includes('возвращать нечего'));

// пропавшая из прогона проверка считается незакрытой, а не закрытой молча
const gone = buildFixReport(buildFixPlan(audit([c('robots', 'bad'), c('og', 'warn')]), { price: 100 }), audit([c('robots', 'ok')]));
is('пропавшая проверка не закрыта', gone.stillOpen.length, 1);
is('и за неё возвращается доля', gone.refund, 50);

// Язык аудита. Русское письмо переводит названия проверок само, английское по русскому аудиту не собрать.
const enAudit = { meta: { host: 'x.com', lang: 'en', collectedAt: '2026-09-11T00:00:00.000Z' }, checks: [{ id: 'www', status: 'warn', label: 'www canonicalisation', value: 'www.x.com answers 200 without redirecting', group: 'technical' }] };
const ruLetter = buildFixPlan(enAudit, { price: 21000 });
ok('русское письмо по английскому аудиту переводит названия', /[А-Яа-я]/.test(ruLetter.included[0].check.label));
ok('и это не считается расхождением языков', !ruLetter.langMismatch);
const ruAudit = { meta: { host: 'x.ru', lang: 'ru', collectedAt: '2026-09-11T00:00:00.000Z' }, checks: [c('www', 'warn')] };
ok('английское письмо по русскому аудиту помечено как брак', buildFixPlan(ruAudit, { lang: 'en', price: 249 }).langMismatch);

// у каждого действия есть оба языка
const noEn = Object.entries(FIX_ACTIONS).filter(([, r]) => {
  const f = r.action || r.why;
  return !f || typeof f !== 'object' || !f.ru || !f.en;
}).map(([id]) => id);
is('у каждого действия есть русский и английский текст', noEn, []);

// покрытие: у каждой проверки, которую умеет собирать сборщик, есть решение
const files = process.argv.slice(2);
if (files.length) {
  const ids = new Set();
  for (const f of files) for (const x of JSON.parse(readFileSync(f, 'utf8')).checks) ids.add(x.id);
  const missing = [...ids].filter((id) => !FIX_ACTIONS[id]);
  is('для каждой собираемой проверки описано решение', missing, []);
}

if (bad) { console.error(`\n${bad} тест(ов) упало`); process.exit(1); }
console.log('\nвсе тесты пакета Fix прошли');
