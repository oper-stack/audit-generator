#!/usr/bin/env node
/**
 * Мы меряем то, что человек станет чинить, и говорим ему, что именно измерили.
 *
 * 16.09.2026 живой пользователь прошёл путь с 63 до 95 и назвал два узких места подряд:
 * в выборку попали расшифровки на семь тысяч слов, а таблицу, добавленную на главную, проверка
 * не увидела. Оба оказались правдой. Отбор шёл сортировкой по длине адреса по убыванию, то есть
 * наверх поднимались самые глубокие страницы, а главная в оценку содержания не входила вовсе.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'visibility.mjs'), 'utf8');

let bad = 0;
const ok = (n, c) => { if (c) console.log(`ok   ${n}`); else { bad++; console.error(`FAIL ${n}`); } };

ok('главная входит в оценку содержания наравне с остальными',
  /const contentPages = \[homePage, \.\.\.sampled\]/.test(src));
ok('сортировки по длине адреса по убыванию больше нет',
  !/sort\(\(a, b\) => b\.length - a\.length\)/.test(src));
ok('страницы отбираются по близости к корню', /depth\(a\) - depth\(b\)/.test(src));
ok('и по одной из каждого раздела', /usedSections/.test(src));
ok('отчёт называет измеренные страницы', /measured: \(list\)/.test(src) && /T\.measured\(/.test(src));
ok('находка про абзац-ответ называет страницы', /answerFirstMissing: \(n, total, where\)/.test(src));

// Отбор должен быть строго определённым: два прогона по одному сайту берут одни и те же страницы,
// иначе балл гуляет и человек не понимает, что изменилось от его правки.
const depth = (u) => new URL(u).pathname.replace(/\/$/, '').split('/').filter(Boolean).length;
const section = (u) => new URL(u).pathname.split('/').filter(Boolean)[0] || '';
const pick = (pages, want) => {
  const byDepth = [...pages].sort((a, b) => depth(a) - depth(b) || a.length - b.length || (a < b ? -1 : 1));
  const out = []; const used = new Set();
  for (const p of byDepth) { if (out.length >= want) break; const s = section(p); if (used.has(s)) continue; used.add(s); out.push(p); }
  for (const p of byDepth) { if (out.length >= want) break; if (!out.includes(p)) out.push(p); }
  return out;
};
const site = [
  'https://x.ru/blog/rasshifrovka-vypuska-nomer-sorok-dva-pro-vsyo-na-svete/',
  'https://x.ru/blog/rasshifrovka-vypuska-nomer-sorok-tri-pro-vsyo-na-svete/',
  'https://x.ru/uslugi/', 'https://x.ru/ceny/', 'https://x.ru/o-nas/', 'https://x.ru/blog/',
];
const got = pick(site, 3);
ok('расшифровки больше не вытесняют витрину', !got.some((u) => u.includes('rasshifrovka')));
ok('взяты разные разделы', new Set(got.map(section)).size === got.length);
ok('отбор повторяем', JSON.stringify(pick(site, 3)) === JSON.stringify(got));

console.log(bad ? `\nпровалов: ${bad}` : '\nвсё сходится');
process.exit(bad ? 1 : 0);
