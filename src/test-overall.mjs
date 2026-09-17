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
import { toHtml, overallSummary } from './render.mjs';

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
// Девять плюс главная это десять. Число стоит на витрине словами «другие проверяют одну
// страницу, мы проверяем десять», поэтому оно обязано совпадать с тем, что движок правда читает.
is('глубина выборки одна на всех', VISIBILITY_DEFAULTS.samplePages, 9);
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

/*
 * Подпись под баллом обязана объяснить человеку три вещи, иначе он прочитает разницу в пару
 * пунктов как ошибку: откуда взялось число, что успели прочитать, и почему повтор может дать
 * иначе. Это критерий приёмки, а не украшение: человек, прочитавший сначала страницу, а потом
 * отчёт, не должен удивиться.
 */
{
  const audit = JSON.parse(readFileSync(new URL('../examples/sample-audit.json', import.meta.url), 'utf8'));
  const areas = [{ id: 'access', label: 'Access', score: 20, max: 25 }, { id: 'index', label: 'Index', score: 10, max: 15 },
    { id: 'entity', label: 'Entity', score: 12, max: 20 }, { id: 'content', label: 'Content', score: 14, max: 25 }, { id: 'trust', label: 'Trust', score: 5, max: 15 }];
  const note = (a) => ((toHtml(a, null).match(/overall-note">([^<]*)</) || [])[1] || '');

  for (const lang of ['en', 'ru']) {
    audit.meta.lang = lang;

    audit.overall = { score: 61, grade: 'B', areas, source: 'visibility:reused', measuredAt: '2026-09-14T20:00:00.000Z', basis: { pages: 4, sitemapRead: true, sitemapUnchecked: false } };
    const reused = note(audit);
    ok(`${lang}: сказано, что число уже видели на проверке`, lang === 'en' ? /already saw on the free check/.test(reused) : /уже видели в бесплатной проверке/.test(reused));
    ok(`${lang}: сказано, что здесь не меряли заново`, lang === 'en' ? /not measured again here/.test(reused) : /не меряется заново/.test(reused));
    ok(`${lang}: названа дата измерения`, /2026-09-14/.test(reused));
    ok(`${lang}: сказано, сколько страниц прочитано`, /4/.test(reused));
    ok(`${lang}: предупреждает про разброс в пункт-другой`, lang === 'en' ? /a point or two/.test(reused) : /на пункт-другой/.test(reused));

    audit.overall = { score: 61, grade: 'B', areas, source: 'visibility', basis: { pages: 1, sitemapRead: false, sitemapUnchecked: true } };
    const fresh = note(audit);
    ok(`${lang}: при собственном измерении сказано именно это`, lang === 'en' ? /Measured here by the same code/.test(fresh) : /Измерено здесь тем же кодом/.test(fresh));
    ok(`${lang}: непрочитанная карта сайта названа, а не спрятана`, lang === 'en' ? /sitemap did not answer in time/.test(fresh) : /карта сайта не ответила вовремя/.test(fresh));
    ok(`${lang}: и сказано, что она не зачтена в минус`, lang === 'en' ? /not counted against the score/.test(fresh) : /не зачтено ни в плюс, ни в минус/.test(fresh));
    ok(`${lang}: в подписи нет чужого языка`, lang === 'en' ? !/[А-Яа-яЁё]/.test(fresh) : !/Measured|sitemap did/.test(fresh));
  }

  // Русское склонение в подписи: человек это читает.
  audit.meta.lang = 'ru';
  for (const [n, word] of [[1, 'страница'], [2, 'страницы'], [5, 'страниц'], [11, 'страниц'], [21, 'страница']]) {
    audit.overall = { score: 61, grade: 'B', areas, source: 'visibility', basis: { pages: n, sitemapRead: true, sitemapUnchecked: false } };
    ok(`ru: ${n} ${word}`, new RegExp(`Прочитано ${n} ${word} сайта`).test(note(audit)));
  }
}

// ---- один блок «балл и области» на отчёт и на письмо
//
// Письмо собирало свою формулировку и свою цифру, отчёт свою. Разошлись. Теперь обе стороны
// зовут overallSummary, и разойтись нечему: текст ровно один и живёт в пакете.
{
  const areas = [{ id: 'access', label: 'Can AI crawlers read it', score: 20, max: 25 },
    { id: 'index', label: 'Is there a map for agents (llms.txt)', score: 5, max: 15 },
    { id: 'entity', label: 'Is the entity clear (schema)', score: 12, max: 20 },
    { id: 'content', label: 'Is there something to quote', score: 18, max: 25 },
    { id: 'trust', label: 'Can it be dated and trusted', score: 8, max: 15 }];
  const overall = { score: 63, grade: 'B', areas, source: 'visibility:reused', measuredAt: '2026-09-14T20:00:00.000Z', basis: { pages: 4, sitemapRead: true, sitemapUnchecked: false } };

  const ru = overallSummary(overall, { lang: 'ru' });
  const en = overallSummary(overall, { lang: 'en' });
  is('заголовок письма это заголовок отчёта', ru.score, 63);
  is('сумма пяти областей даёт заголовок', ru.areas.reduce((a, x) => a + x.score, 0), ru.score);
  ok('оценка словом переведена', ru.grade === 'Рабочее состояние' && en.grade === 'Workable');
  const fixture = JSON.parse(readFileSync(new URL('../examples/sample-audit.json', import.meta.url), 'utf8'));
  fixture.meta.lang = 'ru'; fixture.overall = overall;
  ok('подпись та же, что печатает отчёт', ru.note === (toHtml(fixture, null).match(/overall-note">([^<]*)</) || [])[1]);

  // Замер мог пройти на английской странице, а отчёт уходит русскому покупателю: язык отчёта главнее.
  ok('названия областей на языке отчёта, а не замера', ru.areas[0].label === 'Могут ли роботы ИИ прочитать сайт');
  ok('и в английском они английские', en.areas[0].label === 'Can AI crawlers read it');
  ok('в русском блоке нет английских названий', !ru.areas.some((x) => /[A-Za-z]{4}/.test(x.label.replace('llms.txt', ''))));

  // Шесть областей отчёта это второе измерение, и подпись обязана это говорить в обоих языках.
  ok('подзаголовок второго измерения есть', /Второе, отдельное измерение/.test(ru.secondMeasure) && /second, separate measurement/.test(en.secondMeasure));
  ok('и сказано, что складывать их с заголовком не надо', /в сумме его не дают/.test(ru.secondMeasureFoot) && /will not add up to it/.test(en.secondMeasureFoot));
  ok('в подписи второго измерения нет разметки', !/</.test(ru.secondMeasureFoot) && !/</.test(en.secondMeasureFoot));

  // Балла может не быть: движок не мерит закрытые адреса. Тогда письмо не называет цифру вовсе.
  is('без балла блока нет', overallSummary({ score: null, grade: 'not measured', areas: [] }, { lang: 'ru' }), null);
  is('и на пустом объекте тоже', overallSummary(null, { lang: 'en' }), null);
}

// ---- движок в пакете это та же программа, что стоит на сайтах
{
  const here = readFileSync(new URL('./visibility.mjs', import.meta.url), 'utf8');
  ok('движок несёт свои параметры', /VISIBILITY_DEFAULTS/.test(here));
  ok('и не тянет за собой зависимостей', !/^import /m.test(here.replace(/VISIBILITY_DEFAULTS/g, '')));
}

if (bad) { console.error(`\n${bad} тест(ов) упало`); process.exit(1); }
console.log('\nвсе тесты общего балла прошли');
