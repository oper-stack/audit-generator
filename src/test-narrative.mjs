#!/usr/bin/env node
/** Черновик текста аудита: заполняет всё, ничего не выдумывает, читается человеком. */
import { draftNarrative, stillEmpty } from './narrative.mjs';

let bad = 0;
const is = (n, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { bad++; console.error(`FAIL ${n}\n  ждали ${JSON.stringify(b)}\n  вышло ${JSON.stringify(a)}`); } else console.log(`ok   ${n}`); };
const ok = (n, c) => is(n, Boolean(c), true);

const audit = (over = {}) => ({
  meta: { host: 'x.ru', site: 'https://x.ru', collectedAt: '2026-09-11T00:00:00.000Z', lang: 'en', language: '' },
  client: { name: '{{CLIENT NAME}}', subject: '{{What the site sells and where}}', reportDate: '2026-09-11', preparedBy: 'OperStack' },
  scores: { 'SEO, technical': 9, 'SEO, content and structure': 4, 'AEO, answers and snippets': 6, 'GEO, visibility in AI systems': 8, 'Off-page and trust': null, 'Conversion and UX': 5 },
  summary: { lead: '{{a}}', verdict: '{{b}}', priorities: ['{{1}}', '{{2}}', '{{3}}'] },
  overview: { rows: [['CMS / stack', 'Astro'], ['Pages in sitemap', '40'], ['Language', '{{language}}'], ['What is sold', '{{products}}']], note: '{{note}}' },
  content: { strengths: ['{{s}}'], weaknesses: ['{{w}}'], gaps: ['{{g}}'] },
  aeo: { works: ['{{x}}'], blocks: ['{{y}}'], recommendation: '{{r}}' },
  geo: { rows: [['Entity clarity', '{{s}}', '{{d}}'], ['Third-party mentions', '{{s}}', '{{d}}'], ['Reviews and PR', '{{s}}', '{{d}}']], callout: '{{c}}' },
  offpage: { listed: ['{{l}}'], note: '{{n}}' },
  conversion: { rows: [['Contact form', '{{s}}'], ['Price visible', '{{s}}'], ['Messengers', '{{s}}']] },
  roadmap: [
    { badge: 'Week 1', title: 'Critical', items: ['Fix: Image alt text', '{{...}}'] },
    { badge: 'Weeks 2 to 4', title: 'Foundation', items: ['{{...}}'] },
    { badge: 'Months 2 to 3', title: 'Growth', items: ['{{...}}'] },
  ],
  closing: '{{close}}',
  sample: [{ url: 'https://x.ru/', title: 'Дом', description: 'Мы продаём станки', words: 900, answerFirst: false }],
  checks: [
    { id: 'alt', group: 'onpage', label: 'Image alt text', status: 'bad', value: '3 of 10 images carry alt text (30%) across 5 sampled page(s)' },
    { id: 'thin', group: 'content', label: 'Thin pages in sample', status: 'warn', value: '4 of 20 pages under 300 words' },
    { id: 'answer-first', group: 'aeo', label: 'Answer-first opening paragraph', status: 'bad', value: '2 of 20 sampled page(s) open with a figure' },
    { id: 'sources', group: 'aeo', label: 'Sources named in the text', status: 'ok', value: '18 of 20 name a source' },
    { id: 'dates', group: 'content', label: 'Publication dates exposed', status: 'ok', value: '19 of 20 expose dates' },
    { id: 'conv-cta', group: 'conversion', label: 'A call to action in the first screen', status: 'bad', value: '1 of 20 put it in the first 30%' },
    { id: 'conv-messenger', group: 'conversion', label: 'Messenger link', status: 'ok', value: 'telegram found' },
    { id: 'trust-entity', group: 'trust', label: 'Who the business is', status: 'ok', value: 'city and country in the structured data' },
    { id: 'ai-search-access', group: 'geo', label: 'AI search fetchers allowed', status: 'ok', value: 'every AI search fetcher may read the site' },
  ],
  ...over,
});

const d = draftNarrative(audit(), { lang: 'ru' });
is('не осталось ни одной дыры', stillEmpty(d), []);
ok('имя клиента это адрес сайта, а не выдумка', d.client.name === 'x.ru');
ok('предмет взят с главной и помечен как прочитанный', d.client.subject.includes('Мы продаём станки') && /подтвердите/i.test(d.client.subject));

// Ничего не выдумываем: там, где не мерили, так и написано
ok('упоминания на чужих сайтах помечены как неизмеренные', d.geo.rows[1][1] === 'не измеряли');
ok('и объяснено почему', /за деньги/.test(d.geo.rows[1][2]));
ok('в разделе ссылок сказано, что данные платные', /не покупаем данные/.test(d.offpage.note));
ok('язык не выдуман, если его нет в коде', /не указан/.test(d.overview.rows[2][1]));

// Числа сходятся между собой
const openN = 4; const mech = 2; // alt, conv-cta механические; thin и answer-first это тексты
ok('в выводе число открытых проверок верное', d.summary.verdict.includes(`${openN} вещи`) || d.summary.verdict.includes(`${openN} вещей`));
ok('и механических не больше, чем всех', d.summary.verdict.includes(`${mech} правятся`) || d.summary.verdict.includes(`${mech} правится`));

// Приоритеты это действие, а не название проверки
ok('приоритет говорит, что делать', /Проставить подписи/.test(d.summary.priorities[0]));
ok('и показывает, как сейчас', /Сейчас:/.test(d.summary.priorities[0]));
ok('работа с текстами названа работой, а не отговоркой', d.summary.priorities.some((p) => /Наполнить короткие страницы|прямой ответ/.test(p)));

// Русский отчёт по английскому аудиту не должен содержать английских названий проверок
const ruText = JSON.stringify([d.summary, d.content, d.aeo, d.roadmap, d.closing]);
ok('в русском черновике нет английских названий проверок', !/Image alt text|Thin pages|call to action/.test(ruText));
ok('области названы по-русски', /техническая часть|Конверсия/.test(d.summary.lead));

// Дорожная карта: уже написанные строки переведены, пустые заполнены
ok('готовая строка карты переведена', d.roadmap[0].items[0].includes('подписи'));
ok('пустая строка карты заполнена делом', !d.roadmap[1].items[0].includes('{{'));

// Английский отчёт остаётся английским
const e = draftNarrative(audit(), { lang: 'en' });
is('по-английски тоже без дыр', stillEmpty(e), []);
ok('английский черновик без кириллицы', !/[А-Яа-яЁё]/.test(JSON.stringify([e.summary, e.aeo, e.closing])));
ok('и приоритет тоже действие', /Write alt text/.test(e.summary.priorities[0]));

// Здоровый сайт: вывод не пугает, а говорит правду
const clean = draftNarrative(audit({ checks: [
  { id: 'alt', group: 'onpage', label: 'Image alt text', status: 'ok', value: 'all images carry alt text' },
  { id: 'ai-search-access', group: 'geo', label: 'AI search fetchers allowed', status: 'ok', value: 'allowed' },
] }), { lang: 'ru' });
ok('на чистом сайте вывод говорит, что чинить нечего', /критичных поломок нет/.test(clean.summary.verdict));
ok('и заключение не выдумывает проблем', /нечего/.test(clean.closing));

// Ничего уже написанного человеком не затирается
const edited = audit();
edited.summary.lead = 'Текст, который написал аналитик.';
const keep = draftNarrative(edited, { lang: 'ru' });
is('правку аналитика черновик не трогает', keep.summary.lead, 'Текст, который написал аналитик.');

// Заблокированные фетчеры это прямой приговор, а не намёк
const blocked = draftNarrative(audit({ checks: [{ id: 'ai-search-access', group: 'geo', label: 'AI search fetchers allowed', status: 'bad', value: '3 blocked' }] }), { lang: 'ru' });
ok('если роботы ИИ закрыты, об этом сказано прямо', /невозможно физически/.test(blocked.geo.callout));

if (bad) { console.error(`\n${bad} тест(ов) упало`); process.exit(1); }
console.log('\nвсе тесты черновика прошли');
