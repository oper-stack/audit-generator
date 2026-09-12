/**
 * Правило, которое защищает этот файл: платное оформление не включается без лицензии, а
 * бесплатная подпись работает всегда. Если сломать первое, агентский план перестанет продаваться,
 * если второе, отчёт перестанет подписываться именем покупателя.
 *
 * Ключ здесь генерируется прямо в тесте одноразовой парой Ed25519: настоящий приватный ключ в
 * репозитории не лежит и лежать не должен.
 */
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveBranding, verifyKey, softenHex } from './agency.mjs';
import { toHtml } from './render.mjs';

let failed = 0;
const ok = (name, cond) => { if (cond) console.log(`ok   ${name}`); else { failed++; console.error(`FAIL ${name}`); } };

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const pub = publicKey.export({ type: 'spki', format: 'pem' });
const makeKey = (data) => {
  const payload = Buffer.from(JSON.stringify(data));
  return `OSK1.${payload.toString('base64url')}.${sign(null, payload, privateKey).toString('base64url')}`;
};

// Проверка подписи
ok('правильный ключ принимается', verifyKey(makeKey({ email: 'a@b.co', plan: 'agency' }), pub).ok);
ok('мусор отвергается', !verifyKey('OSK1.aaa.bbb', pub).ok);
ok('чужая подпись отвергается', !verifyKey(makeKey({ plan: 'agency' }).replace(/.$/, 'A'), pub).ok);
ok('просроченный план отвергается', !verifyKey(makeKey({ plan: 'agency', expires: '2020-01-01' }), pub).ok);
ok('ключ другого продукта отвергается', !verifyKey(makeKey({ plan: 'site-kit' }), pub).ok);
ok('срок в будущем проходит', verifyKey(makeKey({ plan: 'agency', expires: '2999-01-01' }), pub).ok);

// Что бесплатно, а что нет
const free = resolveBranding({ by: 'Harper & Vale' });
ok('подпись именем работает без лицензии', free.preparedBy === 'Harper & Vale' && free.notes.length === 0);
ok('без платных опций строка об инструменте остаётся', free.showToolLine === true);

const blocked = resolveBranding({ by: 'X', color: '#123456', toolLine: false });
ok('без лицензии цвет не применяется', !blocked.accent && blocked.showToolLine === true);
ok('и человеку сказано почему', blocked.notes.some((n) => /agency plan/i.test(n)));

// Цвет
ok('светлая версия цвета светлее исходной', parseInt(softenHex('#0b7a75').slice(1, 3), 16) > 0x0b);
ok('кривой цвет не проходит', resolveBranding({ color: 'нет', licence: makeKey({ plan: 'agency' }) }).accent === '');

// Вёрстка
const audit = {
  meta: { host: 'example.com', tool: '@operstack/audit 0.0.0', collectedAt: '2026-01-01T00:00:00Z', auditType: 'External', lang: 'en' },
  client: { name: 'Client', subject: 'Sells things', reportDate: '2026-01-01', preparedBy: 'OperStack' },
  scores: {}, scoreBasis: {}, summary: { lead: 'a', verdict: 'b', priorities: ['c'] },
  overview: { rows: [], note: '' }, sample: [], checks: [], critical: [],
  content: { strengths: [], weaknesses: [], gaps: [] },
  aeo: { works: [], blocks: [], recommendation: '' }, geo: { rows: [], callout: '' },
  offpage: { listed: [], note: '' }, conversion: { rows: [] }, sources: [], limitations: [],
  roadmap: [], closing: 'done',
};
const plain = toHtml(audit);
ok('без оформления на обложке стоит наше имя', plain.includes('OperStack') && !plain.includes('<img class="cover-logo"'));

const branded = toHtml(audit, { preparedBy: 'Harper & Vale Digital', logo: 'data:image/svg+xml;base64,AAA', accent: '#7b3fa0', showToolLine: false });
ok('имя агентства попало на обложку', branded.includes('Harper &amp; Vale Digital'));
ok('логотип попал на обложку', branded.includes('<img class="cover-logo"'));
ok('цвет агентства подменил акцент', branded.includes('--accent:#7b3fa0'));
ok('строка про инструмент убрана', !branded.includes('@operstack/audit 0.0.0'));
ok('но воспроизводимость обещана по-прежнему', /reproduced from it/i.test(branded));
ok('нашего имени в фирменном отчёте не осталось', !/OperStack/.test(branded));

// Список сайтов
const { parseList } = await import('./batch.mjs');
const list = parseList('# комментарий\n\nexample.com, Northline Dental\nhttps://two.example\nне адрес\n');
ok('список разбирается', list.length === 3 && list[0].name === 'Northline Dental');
ok('адрес без схемы достраивается', list[0].url.startsWith('https://example.com'));
ok('строка-мусор помечена, а не роняет прогон', list[2].invalid === true);

// Ключ из файла рядом с работой
const dir = mkdtempSync(join(tmpdir(), 'operstack-agency-'));
writeFileSync(join(dir, '.operstack-licence'), makeKey({ plan: 'agency', email: 'x@y.z' }));
const cwd = process.cwd();
process.chdir(dir);
const { findKey } = await import('./agency.mjs');
ok('ключ читается из файла .operstack-licence', findKey().startsWith('OSK1.'));
process.chdir(cwd);

console.log(failed ? `\n${failed} проверок не прошли` : '\nагентский план: лицензия, оформление и список проверены');
process.exit(failed ? 1 : 0);
