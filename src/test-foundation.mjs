#!/usr/bin/env node
/** Пакет Foundation: раскладка страниц, доли работы, цена, два языка. */
import { buildFoundationScope, renderFoundationScope, renderFoundationChecklist } from './foundation.mjs';

let bad = 0;
const is = (n, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { bad++; console.error(`FAIL ${n}\n  ждали ${JSON.stringify(b)}\n  вышло ${JSON.stringify(a)}`); } else console.log(`ok   ${n}`); };
const ok = (n, c) => is(n, Boolean(c), true);

const page = (over) => ({ url: 'https://x.ru/p', title: 'Страница', words: 900, answerFirst: true, sourcePhrases: 2, citedParagraphs: 1, figureParagraphs: 4, h2Count: 5, tables: 1, ...over });
const audit = (sample) => ({ meta: { host: 'x.ru', collectedAt: '2026-09-11T00:00:00.000Z' }, sample });

const clean = buildFoundationScope(audit([page(), page({ url: 'https://x.ru/b' })]));
is('чистые страницы в смету не попадают', clean.pages.length, 0);
is('и считаются как в порядке', clean.cleanPages, 2);
ok('письмо говорит, что работы нет', renderFoundationScope(clean).includes('Работы нет'));
is('цена без работы ноль долей', clean.shares, 0);

const thin = buildFoundationScope(audit([page({ words: 120 })]));
is('пустая страница это три доли', thin.pages[0].shares, 3);
is('и помечена как «написать заново»', thin.pages[0].tier, 'rewrite');

const one = buildFoundationScope(audit([page({ answerFirst: false })]));
is('одна беда это одна доля', one.pages[0].shares, 1);
is('и это «одна правка»', one.pages[0].tier, 'touch');

const two = buildFoundationScope(audit([page({ answerFirst: false, h2Count: 1 })]));
is('две беды это две доли', two.pages[0].shares, 2);
is('и обе названы', two.pages[0].issues.map((i) => i.id), ['answer-first', 'sections']);

// Пороги: короткой странице не вменяем отсутствие таблицы, пустой не вменяем всё подряд дважды
const short = buildFoundationScope(audit([page({ words: 400, tables: 0 })]));
is('таблицу спрашиваем только с длинных страниц', short.pages.length, 0);
const noSrc = buildFoundationScope(audit([page({ words: 250, sourcePhrases: 0, citedParagraphs: 0, h2Count: 0 })]));
is('с пустой страницы не спрашиваем источники и разделы отдельно', noSrc.pages[0].issues.map((i) => i.id), ['thin']);

// Цена
const many = buildFoundationScope(audit([page({ words: 100 }), page({ url: 'https://x.ru/b', answerFirst: false, h2Count: 1 }), page({ url: 'https://x.ru/c', answerFirst: false })]));
is('доли складываются', many.shares, 6);
is('цена это доли на цену доли', many.raw, 6 * 4200);
is('но не ниже минимума', many.price, Math.max(42000, 6 * 4200));
ok('минимум сработал', many.atMinimum === (many.price > many.raw));
const big = buildFoundationScope(audit(Array.from({ length: 12 }, (_, i) => page({ url: `https://x.ru/${i}`, words: 100 }))));
is('на большом объёме цена выше минимума', big.price, 36 * 4200);
ok('и это уже не минимум', !big.atMinimum);

const withNew = buildFoundationScope(audit([page({ answerFirst: false })]), { newPages: 2 });
is('новая страница считается как написанная с нуля', withNew.newShares, 6);
is('и входит в общую сумму долей', withNew.shares, 7);
ok('в письме названы новые страницы', renderFoundationScope(withNew).includes('Новые страницы: 2'));

// Порядок: тяжёлое сверху
const order = buildFoundationScope(audit([page({ url: 'https://x.ru/a', answerFirst: false }), page({ url: 'https://x.ru/b', words: 100 })]));
is('самая тяжёлая страница идёт первой', order.pages[0].url, 'https://x.ru/b');

// Search Console: без доступа говорим об этом прямо
const noGsc = renderFoundationScope(many);
ok('без доступа к Search Console письмо это признаёт', noGsc.includes('Доступа к Search Console у нас нет'));
ok('и говорит, что доступ бесплатный', noGsc.includes('бесплатно'));
const yesGsc = renderFoundationScope(buildFoundationScope(audit([page({ answerFirst: false })]), { hasSearchConsole: true }));
ok('с доступом письмо берёт страницы с показами', yesGsc.includes('уже собирают показы'));

// Язык
const en = buildFoundationScope(audit([page({ words: 100 }), page({ url: 'https://x.ru/b', answerFirst: false })]), { lang: 'en' });
is('валюта английской сметы', en.currency, 'USD');
is('цена доли по умолчанию', en.unit, 50);
is('минимум пакета', en.minimum, 500);
const letterEn = renderFoundationScope({ ...en, host: 'x.com', pages: en.pages.map((p) => ({ ...p, title: 'A page' })) });
ok('английское письмо без кириллицы', !/[А-Яа-яЁё]/.test(letterEn));
ok('в английском письме есть цена', letterEn.includes('500 USD'));

// Чек-лист
const list = renderFoundationChecklist(many);
ok('в чек-листе все страницы сметы', many.pages.every((p) => list.includes(p.url)));
ok('и все работы по ним', many.pages.every((p) => p.issues.every((i) => list.includes(i.id))));

// Страницы без разбора (редиректы, ошибки) в смету не лезут
const junk = buildFoundationScope(audit([{ url: 'https://x.ru/r', redirect: 'https://x.ru/', status: 301 }, { url: 'https://x.ru/e', status: 404 }, page({ answerFirst: false })]));
is('нечитаемые страницы пропускаются', junk.sampledPages, 1);
is('и не превращаются в работу', junk.pages.length, 1);

// Служебные страницы: политику и контакты в работу не берём и в счёт не ставим
const util = buildFoundationScope(audit([
  page({ url: 'https://x.ru/privacy/', words: 1100, answerFirst: false, sourcePhrases: 0, citedParagraphs: 0, tables: 0 }),
  page({ url: 'https://x.ru/terms/', words: 1100, answerFirst: false, sourcePhrases: 0, citedParagraphs: 0, tables: 0 }),
  page({ url: 'https://x.ru/contact/', words: 1100, answerFirst: false, h2Count: 1 }),
  page({ url: 'https://x.ru/guides/kak-vybrat/', answerFirst: false }),
]));
is('служебные страницы в счёт не идут', util.pages.length, 1);
is('и посчитаны отдельно', util.utilityPages, 3);
is('содержательных страниц одна', util.contentPages, 1);
ok('письмо объясняет, почему служебные не в счёте', renderFoundationScope(util).includes('в работу не берём и в счёт не ставим'));
ok('в счёте осталась только содержательная', util.pages[0].url.includes('/guides/'));

// Источники спрашиваем только там, где цифры есть
const noFigures = buildFoundationScope(audit([page({ url: 'https://x.ru/o-nas/', figureParagraphs: 0, sourcePhrases: 0, citedParagraphs: 0 })]));
is('страница без цифр не должна источников', noFigures.pages.length, 0);
const withFigures = buildFoundationScope(audit([page({ url: 'https://x.ru/o-nas/', figureParagraphs: 3, sourcePhrases: 0, citedParagraphs: 0 })]));
is('страница с цифрами без источников это работа', withFigures.pages[0].issues.map((i) => i.id), ['sources']);

// Четыре беды это уже работа заново, а не «переработка» по цене двух долей
const four = buildFoundationScope(audit([page({ url: 'https://x.ru/g/', words: 700, answerFirst: false, sourcePhrases: 0, citedParagraphs: 0, h2Count: 1, tables: 0 })]));
is('четыре беды дают четыре работы', four.pages[0].issues.length, 4);
is('и три доли, а не две', four.pages[0].shares, 3);
is('с честной пометкой', four.pages[0].tier, 'rewrite');

// Английское множественное число
const en1 = buildFoundationScope(audit([page({ url: 'https://x.ru/a/', answerFirst: false }), page({ url: 'https://x.ru/b/' })]), { lang: 'en' });
const txt1 = renderFoundationScope(en1);
ok('одна страница: needs work, ещё одна is fine', txt1.includes('1 page needs work, 1 more is fine'));

if (bad) { console.error(`\n${bad} тест(ов) упало`); process.exit(1); }
console.log('\nвсе тесты пакета Foundation прошли');
