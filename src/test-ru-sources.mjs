#!/usr/bin/env node
/**
 * Русский сайт, который честно называет источник цифры, получает за это балл.
 *
 * 16.09.2026 живой пользователь сказал прямо: «поиск источника цифр англоязычный, на русском
 * сайте эти пять баллов недостижимы честно». Так и было: в движке платного аудита список слов
 * состоял только из английских выражений, хотя в движке бесплатной проверки русские уже были.
 * Два движка считали одно и то же по-разному.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, 'collect.mjs'), 'utf8');
const vis = readFileSync(resolve(here, 'visibility.mjs'), 'utf8');

let bad = 0;
const ok = (n, c) => { if (c) console.log(`ok   ${n}`); else { bad++; console.error(`FAIL ${n}`); } };

const line = (text) => (text.match(/^const SOURCE_RE = .+$/m) || [''])[0];
ok('списки слов в обоих движках совпадают слово в слово', line(src) === line(vis) && line(src).length > 60);

const RE = new RegExp(line(src).replace(/^const SOURCE_RE = \//, '').replace(/\/giu;$/, ''), 'giu');
const count = (t) => (t.match(RE) || []).length;

for (const t of ['По данным Росстата, рынок вырос на 12%.',
                 'Источник: отчёт Банка России за 2025 год.',
                 'Согласно исследованию, доля выросла до 40%.',
                 'По информации Минфина, ставка снижена.',
                 'По сведениям Росреестра, сделок стало больше.'])
  ok(`русский источник виден: ${t.slice(0, 34)}…`, count(t) > 0);

for (const t of ['According to Rosstat, the market grew 12%.', 'Source: Bank of Russia report.'])
  ok(`английский по-прежнему виден: ${t.slice(0, 30)}…`, count(t) > 0);

for (const t of ['Мы выросли на 12% за год.', 'Наша команда работает с 2019 года.', 'Согласнее всех был директор.'])
  ok(`пустая похвальба источником не считается: ${t.slice(0, 28)}…`, count(t) === 0);

console.log(bad ? `\nпровалов: ${bad}` : '\nвсё сходится');
process.exit(bad ? 1 : 0);
