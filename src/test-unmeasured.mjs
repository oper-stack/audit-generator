#!/usr/bin/env node
/**
 * Не прочитали robots.txt, значит не знаем, а не «всё отлично».
 *
 * 15.09.2026 проверка ставила 25 из 25 и писала «Все 14 роботов ИИ допущены на сайт» сайту, чей
 * robots.txt отдал 403. Файла нет, значит запретов нет, значит отлично. Владелец получал высшую
 * оценку за файл, который мы не открывали. Незнание это не хорошая новость.
 *
 * Здесь держится вся цепочка: движок помечает область неизмеренной и переносит балл на сто по
 * остальным, проверка сходимости это понимает, отчёт печатает слово вместо числа и объясняет,
 * из чего сложился балл.
 *
 * Сервер поднимается на loopback, а зовётся по имени lvh.me: оно публично указывает на 127.0.0.1,
 * и так проверка проходит свой же запрет на частные адреса честно, без лазейки в коде продукта.
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { lookup } from 'node:dns/promises';
import { checkVisibility } from './visibility.mjs';
import { verifyScores } from './collect.mjs';
import { toHtml, overallSummary } from './render.mjs';

let bad = 0;
const ok = (n, c) => { if (c) console.log(`ok   ${n}`); else { bad++; console.error(`FAIL ${n}`); } };
const is = (n, a, b) => ok(`${n} (ждали ${JSON.stringify(b)}, вышло ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b));

const PAGE = `<!doctype html><html lang="ru"><head><title>Пример</title><meta name="description" content="Описание"></head>
<body><main><h1>Пример сайта</h1>${'<p>Обычный абзац текста про товар и цену, без цифр, чтобы было что цитировать. </p>'.repeat(40)}</main></body></html>`;

const serve = ({ robots, status = null }) => new Promise((resolve) => {
  const s = createServer((req, res) => {
    if (req.url.startsWith('/robots.txt')) {
      if (status) { res.writeHead(status, { 'content-type': 'text/html' }); res.end('<html>нет</html>'); return; }
      if (robots === null) { res.writeHead(403, { 'content-type': 'text/html' }); res.end('<html>denied</html>'); return; }
      res.writeHead(200, { 'content-type': 'text/plain' }); res.end(robots); return;
    }
    if (req.url === '/' ) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(PAGE); return; }
    res.writeHead(404, { 'content-type': 'text/plain' }); res.end('no');
  });
  s.listen(0, '127.0.0.1', () => resolve({ s, url: `http://lvh.me:${s.address().port}/` }));
});

let dnsOk = true;
try { const a = await lookup('lvh.me'); dnsOk = a.address === '127.0.0.1'; } catch { dnsOk = false; }

if (!dnsOk) {
  console.log('ПРОПУЩЕНО: lvh.me не указывает на 127.0.0.1 с этой машины, сквозная часть не прогнана');
} else {
  // ---- robots.txt закрыт: область не измерена, балл по остальным
  const { s, url } = await serve({ robots: null });
  let v;
  try { v = await checkVisibility(url, { budgetMs: 8500, samplePages: 3, lang: 'ru' }); } finally { s.close(); }
  ok('проверка прошла (главная читается)', v.ok === true);
  const access = v.areas.find((a) => a.id === 'access');
  is('область доступа помечена неизмеренной', access.measured, false);
  is('и балла у неё нет, а не ноль и не 25', access.score, null);
  ok('первая находка говорит, что файл не прочитан', /не дал этой проверке прочитать robots\.txt/.test(access.findings[0].text));
  ok('и что это не хорошая новость', /не хорошая новость/.test(access.findings[0].text));
  ok('и не пишет «все роботы допущены»', !access.findings.some((f) => /допущены на сайт/.test(f.text)));
  const rest = v.areas.filter((a) => a.id !== 'access');
  const sum = rest.reduce((t, a) => t + a.score, 0);
  const max = rest.reduce((t, a) => t + a.max, 0);
  is('остальные области считаются из 75', max, 75);
  is('балл это доля измеренного, перенесённая на сто', v.score, Math.round((sum / max) * 100));
  ok('в исправлениях нет пункта про непрочитанный файл', !v.fixes.some((f) => f.id === 'robots-unreadable'));

  // ---- сходимость: проверка отчёта понимает неизмеренную область
  const problems = verifyScores({ checks: [], scores: {}, overall: { score: v.score, grade: v.grade, areas: v.areas } }).filter((p) => p.startsWith('overall:'));
  is('проверка сходимости не спорит с движком', problems, []);

  // ---- отчёт: слово вместо числа и честная подпись
  const fixture = JSON.parse(readFileSync(new URL('../examples/sample-audit.json', import.meta.url), 'utf8'));
  fixture.meta.lang = 'ru';
  fixture.overall = { score: v.score, grade: v.grade, areas: v.areas, source: 'visibility', basis: { pages: 1, sitemapRead: false, sitemapUnchecked: false } };
  const html = toHtml(fixture, null);
  ok('в таблице областей стоит слово, а не null', /<td><span>не измерялось<\/span><\/td>/.test(html) && !/null/.test(html.match(/<table class="areas">[\s\S]*?<\/table>/)[0]));
  const note = (html.match(/overall-note">([^<]*)</) || [])[1] || '';
  ok('подпись говорит, сколько областей измерено', /Из пяти областей ниже измерены 4/.test(note));
  ok('и из скольких очков', new RegExp(`${sum} из 75`).test(note));
  ok('и что неизмеренное не в минус', /не зачтена ни в плюс, ни в минус/.test(note));
  ok('старой фразы «пять областей дают в сумме ровно» нет', !/дают в сумме ровно/.test(note));

  fixture.meta.lang = 'en';
  const en = (toHtml(fixture, null).match(/overall-note">([^<]*)</) || [])[1] || '';
  ok('английская подпись тоже честная', /4 could be measured/.test(en) && /not counted for or against/.test(en));

  // ---- письмо берёт тот же блок: null остаётся null, слово едет рядом
  const head = overallSummary(fixture.overall, { lang: 'ru' });
  is('в блоке для письма область без балла', head.areas.find((a) => a.id === 'access').score, null);
  is('и слово для неё передано', head.notMeasured, 'не измерялось');

  // ---- контроль: с прочитанным robots.txt всё как раньше
  const { s: s2, url: url2 } = await serve({ robots: 'User-agent: *\nDisallow: /admin/\n' });
  let v2;
  try { v2 = await checkVisibility(url2, { budgetMs: 8500, samplePages: 3, lang: 'ru' }); } finally { s2.close(); }
  const access2 = v2.areas.find((a) => a.id === 'access');
  is('с прочитанным файлом область измерена', access2.measured, true);
  is('и оценена полностью', access2.score, 25);
  is('и балл это прямая сумма', v2.score, v2.areas.reduce((t, a) => t + a.score, 0));
  ok('подпись в отчёте прежняя', /дают в сумме ровно/.test((toHtml({ ...fixture, meta: { ...fixture.meta, lang: 'ru' }, overall: { ...fixture.overall, score: v2.score, areas: v2.areas } }, null).match(/overall-note">([^<]*)</) || [])[1] || ''));
}

  // ---- файла нет это ОТВЕТ, а не незнание
  //
  // Первая версия правки считала неизмеренным любой неуспех, и сайт без robots.txt терял 25
  // заслуженных баллов: по стандарту отсутствие файла означает, что не запрещено ничего.
  // Поймано на живом example.com сразу после выкладки: балл упал с 30 до 7.
  for (const code of [404, 410]) {
    const { s: s3, url: url3 } = await serve({ status: code });
    let v3;
    try { v3 = await checkVisibility(url3, { budgetMs: 8500, samplePages: 3, lang: 'ru' }); } finally { s3.close(); }
    const a3 = v3.areas.find((a) => a.id === 'access');
    is(`robots.txt ${code}: область измерена`, a3.measured, true);
    is(`robots.txt ${code}: и оценена полностью`, a3.score, 25);
    ok(`robots.txt ${code}: сказано, что файла нет`, /Файла robots\.txt на сайте нет/.test(a3.findings[0].text));
    ok(`robots.txt ${code}: и что это значит «не запрещено ничего»`, /не запрещено ничего/.test(a3.findings[0].text));
    ok(`robots.txt ${code}: не назвали это непрочитанным`, !a3.findings.some((f) => f.id === 'robots-unreadable'));
    is(`robots.txt ${code}: балл это прямая сумма`, v3.score, v3.areas.reduce((t, a) => t + a.score, 0));
  }

  // ---- а отказ и сбой это по-прежнему незнание
  for (const code of [401, 403, 429, 500]) {
    const { s: s4, url: url4 } = await serve({ status: code });
    let v4;
    try { v4 = await checkVisibility(url4, { budgetMs: 8500, samplePages: 3, lang: 'ru' }); } finally { s4.close(); }
    const a4 = v4.areas.find((a) => a.id === 'access');
    is(`robots.txt ${code}: область не измерена`, a4.measured, false);
    ok(`robots.txt ${code}: код назван в тексте`, new RegExp(`код ${code}`).test(a4.findings[0].text));
  }

if (bad) { console.error(`\n${bad} тест(ов) упало`); process.exit(1); }
console.log('\nнепрочитанное не считается ни в плюс, ни в минус, а отсутствующее это ответ');
