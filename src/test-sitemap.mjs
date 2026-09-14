#!/usr/bin/env node
/** Обход карт сайта: ограничители и честность отчёта.
 *
 *  14.09.2026 бесплатная проверка не собрала отчёт по whitewill.ru. В его sitemap.xml 79 вложенных
 *  карт, обход заходил в каждую по 15 секунд, и прогон умирал по таймауту, не дочитав до страниц.
 *  Тесты поднимают такой же сайт локально, чтобы это не вернулось. */
import { createServer } from 'node:http';
import { __readSitemap } from './collect.mjs';
import { localiseChecks } from './i18n.mjs';

let bad = 0;
const ok = (n, c) => { if (c) console.log(`ok   ${n}`); else { bad++; console.error(`FAIL ${n}`); } };
const is = (n, a, b) => ok(`${n} (ждали ${JSON.stringify(b)}, вышло ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b));

const index = (hrefs) => `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${hrefs.map((h) => `<sitemap><loc>${h}</loc></sitemap>`).join('')}</sitemapindex>`;
const urlset = (hrefs) => `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${hrefs.map((h) => `<url><loc>${h}</loc></url>`).join('')}</urlset>`;

/** Сервер отвечает медленно, как настоящий сайт на другом континенте. */
const start = (delayMs, nested) => new Promise((resolve) => {
  const server = createServer(async (req, res) => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    const base = `http://127.0.0.1:${server.address().port}`;
    res.setHeader('content-type', 'application/xml');
    if (req.url === '/sitemap.xml') return res.end(index(Array.from({ length: nested }, (_, i) => `${base}/map-${i}.xml`)));
    if (req.url === '/plain.xml') return res.end(urlset([`${base}/page`, `${base}/feed.xml`]));
    const i = (req.url.match(/map-(\d+)/) || [])[1] ?? '0';
    return res.end(urlset([`${base}/p-${i}-a`, `${base}/p-${i}-b`]));
  });
  server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
});

// 1. Семьдесят девять вложенных карт: читаем несколько файлов, а не все, и говорим об этом.
{
  const { server, base } = await start(30, 79);
  const began = Date.now();
  const r = await __readSitemap(`${base}/sitemap.xml`, { maxFiles: 6, budgetMs: 45000 });
  const took = Date.now() - began;
  is('прочитано ровно столько файлов, сколько разрешено', r.filesRead, 6);
  is('остановились по числу файлов', r.stopped, 'files');
  is('нашли все вложенные карты', r.nestedFound, 79);
  ok('непрочитанные файлы посчитаны', r.pending === 74);
  ok('адресов хватает на выборку страниц', r.urls.length >= 10);
  ok(`уложились в разумное время (${took} мс)`, took < 5000);
  server.close();
}

// 2. Маленький сайт читается целиком, и тогда про ограничители в отчёте ни слова.
{
  const { server, base } = await start(0, 2);
  const r = await __readSitemap(`${base}/sitemap.xml`);
  is('маленькая карта прочитана целиком', r.stopped, '');
  is('файлов прочитано: индекс и две карты', r.filesRead, 3);
  is('собраны все адреса', r.urls.length, 4);
  server.close();
}

// 3. Из обычного urlset вглубь не спускаемся, даже если адрес заканчивается на .xml.
//    Прежнее условие из-за приоритета операторов читало `A || (B && C && D)` и уходило в рекурсию.
{
  const { server, base } = await start(0, 2);
  const r = await __readSitemap(`${base}/plain.xml`);
  is('из urlset рекурсии нет', r.filesRead, 1);
  is('ссылка на .xml осталась адресом страницы', r.urls.length, 2);
  server.close();
}

// 4. Общий бюджет времени соблюдается, даже если файлов мало, а сайт медленный.
{
  const { server, base } = await start(200, 40);
  const began = Date.now();
  const r = await __readSitemap(`${base}/sitemap.xml`, { maxFiles: 100, budgetMs: 700 });
  const took = Date.now() - began;
  is('остановились по времени', r.stopped, 'time');
  ok(`бюджет времени соблюдён (${took} мс)`, took < 2500);
  server.close();
}

// 5. По-русски усечённый обход называется словами, а не «не отдаётся, код 1200».
//    Локализатор подбирает строку регулярным выражением, поэтому новая формулировка без своей
//    ветки молча проваливается в числовую. Ровно это уже случалось с нулями в отчёте.
{
  const en = [{ id: 'sitemap', group: 'technical', label: 'XML sitemap', status: 'ok', value: '1200 URL(s) read from 6 of 79 sitemap file(s) in https://example.ru/sitemap.xml', comment: '' }];
  const ru = localiseChecks(en, 'ru')[0].value;
  ok(`усечение названо словами: "${ru}"`, /прочитано из 6 файлов карты, всего файлов 79/.test(ru));
  ok('и это не выдано за код ответа', !/не отдаётся/.test(ru));
  const whole = localiseChecks([{ ...en[0], value: '1200 URL(s) in https://example.ru/sitemap.xml' }], 'ru')[0].value;
  ok(`целая карта по-прежнему читается нормально: "${whole}"`, /в карте сайта/.test(whole));
}

if (bad) { console.error(`\n${bad} тест(ов) упало`); process.exit(1); }
console.log('\nвсе тесты обхода карт прошли');
