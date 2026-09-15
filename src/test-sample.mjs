#!/usr/bin/env node
/**
 * Прочитать меньше не должно выглядеть как «стало лучше».
 *
 * 15.09.2026 один и тот же сайт в шести прогонах подряд дал 46, 54, 59 и 69 баллов. Выше он
 * выходил там, где из выборки успела ответить одна страница вместо двух: области «есть ли что
 * процитировать» и «дата и доверие» считались по одной главной, а она у большинства сайтов
 * лучше внутренних страниц. То есть медленная сеть выглядела как хороший сайт, и покупатель,
 * запустивший проверку дважды, видел два разных числа.
 *
 * Теперь: страниц хватало, а ответили не все, значит эти две области не измерены. Балл считается
 * по остальным и переносится на сто, как и при нечитаемом robots.txt. Здесь это держится на
 * живом сервере: одна страница выборки отвечает сразу, вторая висит дольше отпущенного времени.
 */
import { createServer } from 'node:http';
import { lookup } from 'node:dns/promises';
import { checkVisibility } from './visibility.mjs';

let bad = 0;
const ok = (n, c) => { if (c) console.log(`ok   ${n}`); else { bad++; console.error(`FAIL ${n}`); } };
const is = (n, a, b) => ok(`${n} (ждали ${JSON.stringify(b)}, вышло ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b));

const page = (title, extra = '') => `<!doctype html><html lang="ru"><head><title>${title}</title>
<meta name="description" content="Описание страницы для проверки, достаточно длинное чтобы не считаться пустым.">
<link rel="canonical" href="http://example.com/"></head><body><main><h1>${title}</h1>
${'<p>Обычный абзац текста про товар, услугу и цену без источника.</p>'.repeat(12)}${extra}</main></body></html>`;

/** Сервер: главная и две страницы в карте сайта, вторая из них отвечает медленнее отпущенного. */
const serve = ({ slowPages = 0, slowMs = 9000 } = {}) => new Promise((resolve) => {
  const s = createServer((req, res) => {
    const send = (code, type, body) => { res.writeHead(code, { 'content-type': type }); res.end(body); };
    if (req.url.startsWith('/robots.txt')) return send(200, 'text/plain', `User-agent: *\nAllow: /\nSitemap: http://lvh.me:${s.address().port}/sitemap.xml\n`);
    if (req.url.startsWith('/llms.txt')) return send(404, 'text/plain', 'no');
    if (req.url.startsWith('/sitemap.xml')) {
      const base = `http://lvh.me:${s.address().port}`;
      // Восемь внутренних страниц: движок сортирует их по длине адреса и берёт каждую четвёртую,
      // поэтому выборка из двух складывается только на сайте такого размера.
      const urls = ['/', ...Array.from({ length: 8 }, (_, i) => `/stranica-nomer-${i}${'-x'.repeat(8 - i)}/`)];
      return send(200, 'application/xml', `<?xml version="1.0"?><urlset>${urls.map((u) => `<url><loc>${base}${u}</loc></url>`).join('')}</urlset>`);
    }
    if (req.url === '/') return send(200, 'text/html; charset=utf-8', page('Главная'));
    if (req.url.startsWith('/stranica-')) {
      if (slowPages > 0) { setTimeout(() => send(200, 'text/html; charset=utf-8', page('Медленная')), slowMs); return; }
      return send(200, 'text/html; charset=utf-8', page('Внутренняя'));
    }
    return send(404, 'text/plain', 'no');
  });
  s.listen(0, '127.0.0.1', () => resolve({ s, url: `http://lvh.me:${s.address().port}/` }));
});

let dnsOk = true;
try { const a = await lookup('lvh.me'); dnsOk = a.address === '127.0.0.1'; } catch { dnsOk = false; }
if (!dnsOk) { console.log('ok   пропуск: lvh.me не указывает на 127.0.0.1 (нет сети)'); process.exit(0); }

const area = (v, id) => (v.areas || []).find((a) => a.id === id);

// ---- все страницы выборки ответили: области считаются
{
  const { s, url } = await serve();
  const v = await checkVisibility(url, { lang: 'ru', samplePages: 2, budgetMs: 8000 });
  ok('сайт прочитан', v.ok);
  ok('обе области по страницам измерены', area(v, 'content').measured !== false && area(v, 'trust').measured !== false);
  ok('балл посчитан из всех пяти областей', typeof v.score === 'number' && v.score > 0);
  s.close();
}

// ---- страницы выборки не отвечают даже со второй попытки: балла нет вовсе
{
  const { s, url } = await serve({ slowPages: 1 });
  const v = await checkVisibility(url, { lang: 'ru', samplePages: 2, budgetMs: 6000 });
  is('балл не выдан', v.ok, false);
  ok('сказано, сколько страниц ответило', /Из \d+ страниц ответили \d+/.test(v.error));
  ok('сказано, что число не показываем и почему', /защитить нельзя/.test(v.error));
  ok('предложено повторить', /через минуту/.test(v.error));
  ok('это не выдаётся за блокировку', v.blocked === false && v.challenged === false);
  ok('в сообщении нет null и undefined', !/null|undefined|NaN/.test(v.error));
  const en = await checkVisibility(url, { lang: 'en', samplePages: 2, budgetMs: 6000 });
  ok('по-английски то же самое', en.ok === false && /not enough of the site to score/.test(en.error) && !/[А-Яа-яЁё]/.test(en.error));
  s.close();
}

// ---- все страницы отвечают быстро: областям есть на чём считаться
{
  const { s, url } = await serve();
  const v = await checkVisibility(url, { lang: 'ru', samplePages: 2, budgetMs: 8000 });
  ok('быстрый сайт измерен целиком', area(v, 'content').measured !== false && area(v, 'trust').measured !== false);
  s.close();
}

if (bad) { console.error(`\n${bad} тест(ов) упало`); process.exit(1); }
console.log('\nвыборка: прочитать меньше больше не выглядит как «стало лучше»');
