#!/usr/bin/env node
/** Один балл на странице, в письме и в отчёте.
 *
 *  14.09.2026 человек увидел 46 на странице проверки, 61 в письме и шесть областей из шестидесяти
 *  в приложенном PDF. Три числа про один сайт за один день. Считали их разные движки с разными
 *  рамками, и единственный вывод, который делает читатель, это что цифры выдуманы.
 *
 *  Теперь движок один и живёт в этом пакете, а параметры зафиксированы в VISIBILITY_DEFAULTS.
 *  Эти тесты держат три вещи: балл сходится сам с собой, сборщик берёт его у того же движка, и
 *  отчёт печатает именно его, на обоих языках. */
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { collect, computeOverall, computeScores, verifyScores, SCORE_AREAS } from './collect.mjs';
import { checkVisibility, VISIBILITY_DEFAULTS } from './visibility.mjs';
import { toHtml } from './render.mjs';

let bad = 0;
const ok = (n, c) => { if (c) console.log(`ok   ${n}`); else { bad++; console.error(`FAIL ${n}`); } };
const is = (n, a, b) => ok(`${n} (ждали ${JSON.stringify(b)}, вышло ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b));
const c = (group, status, i = 0) => ({ id: `${group}-${status}-${i}`, group, status, label: group, value: 'x' });

// ---- балл по проверкам отчёта: отдельное измерение, оно обязано пересчитываться из checks
is('веса шести областей дают сто', SCORE_AREAS.reduce((s, a) => s + a.weight, 0), 100);
const every = (status) => SCORE_AREAS.flatMap((a) => a.groups.map((g) => c(g, status)));
is('все пройдены: сто', computeOverall(every('ok')).score, 100);
is('все провалены: ноль', computeOverall(every('bad')).score, 0);
is('пустой набор не даёт нуля', computeOverall([]).score, null);
{
  const o = computeOverall([c('technical', 'ok'), c('geo', 'ok')]);
  is('неизмеренное выпадает из знаменателя, а не становится нулём', o.score, 100);
  is('в знаменателе только измеренные веса', o.weighed, 40);
}

// ---- параметры измерения зафиксированы: их расхождение и есть расхождение чисел
is('бюджет времени один на всех', VISIBILITY_DEFAULTS.budgetMs, 8500);
is('глубина выборки одна на всех', VISIBILITY_DEFAULTS.samplePages, 3);
ok('параметры нельзя поменять на ходу', Object.isFrozen(VISIBILITY_DEFAULTS));

// ---- балл видимости сходится сам с собой
{
  const audit = { checks: [], overall: { score: 61, areas: [{ score: 20, max: 25 }, { score: 10, max: 15 }, { score: 12, max: 20 }, { score: 14, max: 25 }, { score: 5, max: 15 }] } };
  is('честный заголовок проверку проходит', verifyScores(audit), []);
  ok('подделанный заголовок ловится', verifyScores({ ...audit, overall: { ...audit.overall, score: 70 } }).some((p) => p.startsWith('overall')));
  ok('шкала не из ста ловится', verifyScores({ checks: [], overall: { score: 20, areas: [{ score: 20, max: 30 }] } }).some((p) => /out of 30/.test(p)));
}
{
  const checks = [c('technical', 'ok'), c('geo', 'bad')];
  const audit = { checks, scores: computeScores(checks).scores, reportScore: computeOverall(checks) };
  is('балл по проверкам отчёта сходится с checks', verifyScores(audit), []);
  ok('подделанный балл по проверкам ловится', verifyScores({ ...audit, reportScore: { score: 99 } }).some((p) => p.startsWith('reportScore')));
}

/*
 * Движок намеренно отказывается мерить приватные адреса: публичная проверка не должна ходить
 * по чужой локальной сети. Значит локальным сайтом «одно число» не докажешь, и это правильно.
 * Здесь проверяется, что в таком случае сборщик не выдумывает балл, а честно отдаёт «не измерено»,
 * и что отчёт от этого не ломается. Совпадение чисел на живом сайте проверяется отдельно,
 * командой `npm run verify:live`, потому что для этого нужна сеть.
 */
{
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end('<!doctype html><html><head><title>Local</title></head><body><h1>Local</h1><p>Text.</p></body></html>');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const direct = await checkVisibility(base, { ...VISIBILITY_DEFAULTS, lang: 'en' });
  const audit = await collect(base, { pages: 2, log: () => {} });
  server.close();

  ok('приватный адрес движок мерить отказывается', !direct.ok);
  is('и сборщик не выдумывает за него балл', audit.overall.score, null);
  is('а называет это неизмеренным', audit.overall.grade, 'not measured');
  is('и говорит, откуда балл должен был прийти', audit.overall.source, 'visibility');
  ok('причина отказа сохранена, а не потеряна', typeof audit.overall.error === 'string' && audit.overall.error.length > 0);
  ok('балл по проверкам отчёта при этом посчитан', typeof audit.reportScore.score === 'number');
  is('и отчёт по-прежнему сходится сам с собой', verifyScores(audit), []);

  for (const lang of ['en', 'ru']) {
    audit.meta.lang = lang;
    const html = toHtml(audit, null);
    // Искать надо напечатанный элемент, а не название стиля: `.overall-num` есть в CSS всегда.
    ok(`${lang}: без балла заголовок не печатается вовсе`, !/<div class="overall-num/.test(html));
    ok(`${lang}: шесть областей отчёта на месте`, /second-measure/.test(html));
  }
}

// Тот же отчёт, но с настоящим баллом: печать заголовка и обе подписи.
{
  const audit = JSON.parse(readFileSync(new URL('../examples/sample-audit.json', import.meta.url), 'utf8'));
  audit.overall = { score: 61, grade: 'B', source: 'visibility', areas: [
    { id: 'access', label: 'Access for AI crawlers', score: 20, max: 25 },
    { id: 'index', label: 'Agent index', score: 10, max: 15 },
    { id: 'entity', label: 'Entity and structure', score: 12, max: 20 },
    { id: 'content', label: 'Answer-first content', score: 14, max: 25 },
    { id: 'trust', label: 'Freshness and sources', score: 5, max: 15 }] };
  is('заголовок сходится со своими областями', verifyScores(audit).filter((p) => p.startsWith('overall')), []);
  for (const [lang, grade] of [['en', /Strong|Workable|Weak|Poor|Critical/], ['ru', /Сильно|Рабочее состояние|Слабо|Плохо|Критично/]]) {
    audit.meta.lang = lang;
    const html = toHtml(audit, null);
    is(`${lang}: в отчёте стоит сохранённый балл`, Number((html.match(/overall-num[^>]*>(\d+)<span>/) || [])[1]), 61);
    ok(`${lang}: оценка словом на своём языке`, grade.test((html.match(/overall-grade">([^<]*)</) || [])[1] || ''));
    ok(`${lang}: сказано, что это то же измерение, что на странице`, /ai-visibility/.test((html.match(/overall-note">([^<]*)</) || [])[1] || ''));
    ok(`${lang}: пять областей напечатаны рядом с баллом`, /table class="areas"/.test(html));
    const foot = (html.match(/scorecard-foot">([^<]*)</) || [])[1] || '';
    ok(`${lang}: сказано, что шесть областей не складываются в заголовок`, lang === 'en' ? /not a breakdown/.test(foot) : /\u043d\u0435 \u0440\u0430\u0437\u0431\u0438\u0432\u043a\u0430/.test(foot));
  }
}

/*
 * Балл, уже измеренный на странице, приезжает в отчёт готовым и не перемеряется.
 *
 * Живая сверка 14.09.2026: whitewill.ru дал 47 и 44 в двух прогонах подряд, habr.com в одном
 * прогоне вернул отказ. Тот же код, разная удача сети: бюджет 8,5 секунды, и карта сайта то
 * успевает прочитаться, то нет. Покупателю всё равно, что оба числа честные, он видит два разных.
 * Поэтому в воронке измерение происходит один раз.
 */
{
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end('<!doctype html><html><head><title>Local</title></head><body><h1>Local</h1><p>Text.</p></body></html>');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;

  const fromPage = { ok: true, score: 63, grade: 'B', checkedAt: '2026-09-14T20:00:00.000Z', ms: 4200, areas: [
    { id: 'access', label: 'Access for AI crawlers', score: 25, max: 25 },
    { id: 'index', label: 'Agent index', score: 10, max: 15 },
    { id: 'entity', label: 'Entity and structure', score: 12, max: 20 },
    { id: 'content', label: 'Answer-first content', score: 11, max: 25 },
    { id: 'trust', label: 'Freshness and sources', score: 5, max: 15 }] };

  const audit = await collect(base, { pages: 2, log: () => {}, visibility: fromPage });
  server.close();

  is('готовый балл берётся как есть', audit.overall.score, 63);
  is('и оценка буквой тоже', audit.overall.grade, 'B');
  is('видно, что балл переиспользован, а не измерен заново', audit.overall.source, 'visibility:reused');
  is('сохранено, когда его измерили', audit.overall.measuredAt, '2026-09-14T20:00:00.000Z');
  is('пять областей приехали целиком', audit.overall.areas.length, 5);
  is('и складываются в заголовок', audit.overall.areas.reduce((a, x) => a + x.score, 0), 63);
  is('отчёт сходится сам с собой', verifyScores(audit), []);
  // Локальный адрес движок бы мерить отказался, а балл всё равно есть: значит второго измерения не было.
  ok('второго измерения не случилось', audit.overall.score === 63 && !audit.overall.error);

  audit.meta.lang = 'ru';
  is('и отчёт печатает именно его', Number((toHtml(audit, null).match(/overall-num[^>]*>(\d+)<span>/) || [])[1]), 63);
}

// ---- движок в пакете это та же программа, что стоит на сайтах
{
  const here = readFileSync(new URL('./visibility.mjs', import.meta.url), 'utf8');
  ok('движок несёт свои параметры', /VISIBILITY_DEFAULTS/.test(here));
  ok('и не тянет за собой зависимостей', !/^import /m.test(here.replace(/VISIBILITY_DEFAULTS/g, '')));
}

if (bad) { console.error(`\n${bad} тест(ов) упало`); process.exit(1); }
console.log('\nвсе тесты общего балла прошли');
