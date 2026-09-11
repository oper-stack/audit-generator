#!/usr/bin/env node
/** Слепота к скриптам: считаем честно, не измерив, так и говорим. */
import { compareReadings, jsBlindnessCheck } from './rendered.mjs';

let bad = 0;
const is = (n, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { bad++; console.error(`FAIL ${n}\n  ждали ${JSON.stringify(b)}\n  вышло ${JSON.stringify(a)}`); } else console.log(`ok   ${n}`); };
const ok = (n, c) => is(n, Boolean(c), true);

const text = (n) => '<p>' + 'слово '.repeat(n) + '</p>';
const body = (inner) => `<html><body>${inner}</body></html>`;

is('одинаковые чтения дают ноль скрытого', compareReadings(body(text(300)), body(text(300))).hiddenShare, 0);
is('и вердикт «в порядке»', compareReadings(body(text(300)), body(text(300))).verdict, 'ok');

const empty = compareReadings(body('<div id="root"></div>'), body(text(300)));
is('пустой каркас против полной страницы это сто процентов', empty.hiddenShare, 100);
is('и это приговор', empty.verdict, 'bad');

const half = compareReadings(body(text(100)), body(text(200)));
is('половина текста за скриптами считается верно', half.hiddenShare, 50);
is('и это тоже приговор', half.verdict, 'bad');

is('пять процентов за скриптами это ещё в порядке', compareReadings(body(text(285)), body(text(300))).verdict, 'ok');
const tenth = compareReadings(body(text(270)), body(text(300)));
is('десятая часть текста за скриптами это уже предупреждение', tenth.verdict, 'warn');
is('и доля посчитана', tenth.hiddenShare, 10);

// Меню и подвал не считаются: их и так никто не цитирует
const chrome = compareReadings(body('<nav>меню меню меню</nav>' + text(100)), body('<nav>меню меню меню другое</nav>' + text(100)));
is('разница только в меню не считается скрытым текстом', chrome.hiddenShare, 0);

// Браузер увидел меньше: это его беда, а не отрицательная доля
is('отрицательной доли не бывает', compareReadings(body(text(300)), body(text(100))).hiddenShare, 0);

// Строка проверки
const good = jsBlindnessCheck([{ url: 'https://x.ru/', raw: 300, rendered: 300, hiddenShare: 0, verdict: 'ok' }], 'ru');
is('чистый сайт получает «ok»', good.status, 'ok');
ok('и понятный текст', /читаются целиком/.test(good.comment));

const worst = jsBlindnessCheck([
  { url: 'https://x.ru/a', raw: 300, rendered: 300, hiddenShare: 0, verdict: 'ok' },
  { url: 'https://x.ru/b', raw: 10, rendered: 400, hiddenShare: 98, verdict: 'bad' },
], 'ru');
is('одна плохая страница делает проверку проваленной', worst.status, 'bad');
ok('в тексте названа худшая страница', worst.value.includes('https://x.ru/b'));
ok('и сказано, сколько слов видно без скриптов', /10 слов без скриптов против 400/.test(worst.value));
ok('приговор говорит про роботов ИИ', /достают страницу в ответ ИИ/.test(worst.comment));

const mild = jsBlindnessCheck([{ url: 'https://x.ru/', raw: 86, rendered: 100, hiddenShare: 14, verdict: 'warn' }], 'ru');
ok('на четырнадцати процентах не пишем «страница почти пустая»', !/почти пустая/.test(mild.comment));
ok('а пишем, что часть текста не доходит', /не доходит/.test(mild.comment));

const none = jsBlindnessCheck([], 'ru');
is('без браузера статус «не измеряли»', none.status, 'na');
ok('и сказано почему', /нет браузера/.test(none.value));

const en = jsBlindnessCheck([{ url: 'https://x.com/', raw: 10, rendered: 400, hiddenShare: 98, verdict: 'bad' }], 'en');
ok('английская версия без кириллицы', !/[А-Яа-яЁё]/.test(JSON.stringify(en)));

if (bad) { console.error(`\n${bad} тест(ов) упало`); process.exit(1); }
console.log('\nвсе тесты слепоты к скриптам прошли');
