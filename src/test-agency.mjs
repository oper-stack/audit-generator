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


// ── Разведка кандидатов ───────────────────────────────────────────────────────
// Правило: в письмо никогда не попадает строка, которую владелец бизнеса не поймёт, и
// ни одна фраза не ссылается на проверку, которой в сборщике нет.
const { OWNER_LINES, overallScore, prospectRow, rank, toCsv, toMarkdown } = await import('./prospect.mjs');
const { CHECK_IDS } = await import('./test-agency-ids.mjs');

const unknown = Object.keys(OWNER_LINES).filter((id) => !CHECK_IDS.includes(id));
ok('каждая фраза ссылается на существующую проверку', unknown.length === 0);
ok('у каждой фразы есть оба языка', Object.values(OWNER_LINES).every((v) => v.en && v.ru));

ok('неизмеренная область не тянет оценку вниз', overallScore({ a: 10, b: null }) === 100);
ok('пустые оценки дают не ноль, а «не измеряли»', overallScore({}) === null);

const mk = (id, status, scores) => ({
  meta: { host: `${id}.example` }, client: { name: id }, scores,
  checks: [{ id, group: 'x', label: 'L', status, value: 'v' }],
});
const weak = prospectRow(mk('ai-search-access', 'bad', { a: 2 }));
ok('перекрытый доступ роботов ИИ попадает в письмо', /ChatGPT/.test(weak.say));
ok('провал посчитан', weak.failing === 1 && weak.warning === 0);

const dull = prospectRow(mk('utility', 'warn', { a: 9 }));
const sharp = prospectRow({
  meta: { host: 'x.example' }, client: { name: 'x' }, scores: { a: 5 },
  checks: [
    { id: 'utility', group: 'x', label: 'L', status: 'warn', value: 'v' },
    { id: 'ai-search-access', group: 'x', label: 'L', status: 'warn', value: 'v' },
  ],
});
ok('при равной тяжести в письмо идёт сильная находка, а не первая', /ChatGPT/.test(sharp.say));
ok('слабая находка всё равно объяснена по-человечески', !/^utility/.test(dull.say));

const ranked = rank([prospectRow(mk('alt', 'warn', { a: 9 })), weak, { ...dull, score: null }]);
ok('сначала идёт тот, у кого хуже', ranked[0].score < ranked[1].score);
ok('сайт без оценки уходит в конец, а не наверх', ranked[ranked.length - 1].score === null);

const csv = toCsv([weak]);
ok('в CSV есть заголовок и строка', csv.split('\n').length === 2 && csv.startsWith('site,name,score'));
ok('запятая внутри фразы не ломает CSV', toCsv([{ ...weak, say: 'a, b' }]).includes('"a, b"'));
ok('в таблице сказано, что строки измерены, а не придуманы', /measured check, not an opinion/.test(toMarkdown([weak])));

const russian = prospectRow(mk('ai-search-access', 'bad', { a: 2 }), { lang: 'ru' });
ok('русская фраза приходит по-русски', /Perplexity не могут/.test(russian.say));


// Три дыры, найденные прогоном по списку, который специально собран из ломающего.
const dead = prospectRow({ meta: { host: 'gone.example', reachable: false }, scores: {}, checks: [] });
ok('мёртвый сайт помечен, а не выдан как кандидат', dead.reachable === false);
const { split } = await import('./prospect.mjs');
const parts = split([dead, prospectRow(mk('alt', 'warn', { a: 9 }))]);
ok('мёртвые не попадают в таблицу кандидатов', parts.live.length === 1 && parts.dead.length === 1);
ok('и названы отдельным списком', /Did not answer/.test(toMarkdown([dead, prospectRow(mk('alt', 'warn', { a: 9 }))])));
ok('мёртвого нет в CSV', !toCsv([dead]).includes('gone.example'));

const bad = prospectRow(mk('ai-search-access', 'bad', { a: 2 }));
ok('статус bad считается провалом, а не пропускается', bad.failing === 1);
ok('и тяжёлая находка доходит до письма', /ChatGPT/.test(bad.say));

const twice = rank([prospectRow(mk('alt', 'warn', { a: 9 })), prospectRow(mk('alt', 'warn', { a: 9 }))]);
ok('один сайт в списке дважды даёт одну строку', twice.length === 1);

console.log(failed ? `\n${failed} проверок не прошли` : '\nагентский план: лицензия, оформление и список проверены');
process.exit(failed ? 1 : 0);

