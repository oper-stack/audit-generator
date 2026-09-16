#!/usr/bin/env node
/**
 * Один сбой сети не должен менять балл.
 *
 * 15.09.2026 сайт avtokomissar-app.ru получил 52 на русской площадке и 67 на английской с
 * разницей в две минуты. Движок, его версия и параметры у обеих одинаковые, значит дело было в
 * самом прогоне: служебные файлы читались по одному разу, и один неудачный ответ решал судьбу
 * целой области. robots.txt стоит 25 очков, llms.txt 15. Владелец сайта читает такое расхождение
 * как «вы врёте», и он прав.
 *
 * Здесь сервер отдаёт llms.txt отказом только на первый запрос, а со второго нормально. Балл
 * обязан совпасть с тем, что даёт всегда исправный сервер.
 *
 * Сервер поднимается на loopback, а зовётся по имени lvh.me: оно публично указывает на 127.0.0.1,
 * и так проверка проходит свой же запрет на частные адреса честно, без лазейки в коде продукта.
 */
import { createServer } from 'node:http';
import { lookup } from 'node:dns/promises';
import { checkVisibility } from './visibility.mjs';

let bad = 0;
const ok = (n, c) => { if (c) console.log(`ok   ${n}`); else { bad++; console.error(`FAIL ${n}`); } };
const is = (n, a, b) => ok(`${n} (ждали ${JSON.stringify(b)}, вышло ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b));

const PAGE = `<!doctype html><html lang="ru"><head><title>Пример</title><meta name="description" content="Описание"></head>
<body><main><h1>Пример сайта</h1>${'<p>Обычный абзац текста про товар и услугу, чтобы было что цитировать. </p>'.repeat(40)}</main></body></html>`;
const LLMS = `# Пример\n\n> Короткое описание сайта.\n\n## Разделы\n\n${Array.from({ length: 6 }, (_, i) => `- [Страница ${i}](http://HOST/p${i}.html): о чём она`).join('\n')}\n`;

/** @param failFirst сколько первых запросов к llms.txt отдать отказом */
const serve = (failFirst) => new Promise((resolve) => {
  let asked = 0;
  const s = createServer((req, res) => {
    if (req.url.startsWith('/llms.txt')) {
      asked += 1;
      if (asked <= failFirst) { res.writeHead(503, { 'content-type': 'text/html' }); res.end('<html>занято</html>'); return; }
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(LLMS.replaceAll('HOST', req.headers.host));
      return;
    }
    if (req.url.startsWith('/robots.txt')) { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('User-agent: *\nAllow: /\n'); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(PAGE);
  });
  s.listen(0, '127.0.0.1', () => resolve({ s, url: `http://lvh.me:${s.address().port}/`, asked: () => asked }));
});

let dnsOk = true;
try { const a = await lookup('lvh.me'); dnsOk = a.address === '127.0.0.1'; } catch { dnsOk = false; }

if (!dnsOk) {
  console.log('ПРОПУЩЕНО: lvh.me не указывает на 127.0.0.1 с этой машины');
} else {
  const opts = { budgetMs: 9000, samplePages: 3, lang: 'ru' };

  const good = await serve(0);
  let clean;
  try { clean = await checkVisibility(good.url, opts); } finally { good.s.close(); }
  ok('исправный сервер: проверка прошла', clean.ok === true);
  const cleanIndex = clean.areas.find((a) => a.id === 'index');
  ok('и карта для агентов зачтена', cleanIndex.score > 0);

  const flaky = await serve(1);
  let shaky;
  try { shaky = await checkVisibility(flaky.url, opts); } finally { flaky.s.close(); }
  ok('сервер с одним сбоем: проверка прошла', shaky.ok === true);
  ok('к llms.txt обратились дважды, а не один раз', flaky.asked() >= 2);
  const shakyIndex = shaky.areas.find((a) => a.id === 'index');
  is('область карты дала тот же балл', shakyIndex.score, cleanIndex.score);
  is('и общий балл совпал', shaky.score, clean.score);

  // Постоянный отказ это не сбой сети: область честно остаётся неизмеренной.
  const dead = await serve(99);
  let never;
  try { never = await checkVisibility(dead.url, opts); } finally { dead.s.close(); }
  const neverIndex = never.areas.find((a) => a.id === 'index');
  is('при постоянном отказе область не измерена', neverIndex.measured, false);
  is('и балла у неё нет, а не ноль', neverIndex.score, null);
  ok('и это не выдаётся за «у вас нет llms.txt»', !neverIndex.findings.some((f) => /Нет llms\.txt/.test(f.text)));
}

console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nодин сбой сети балл не меняет, постоянный отказ не считается ни в плюс, ни в минус');
process.exit(bad ? 1 : 0);
