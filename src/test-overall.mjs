#!/usr/bin/env node
/** Один балл из ста: и в объекте аудита, и в отчёте, и на обоих языках.
 *
 *  14.09.2026 человек получил письмо с «45 из 100» и приложенный PDF, где шесть областей давали
 *  44 из 60, то есть 73 процента. Два разных движка в одном документе читаются как выдуманные
 *  цифры. Эти тесты держат единственный источник балла и запрет считать неизмеренное нулём. */
import { readFileSync } from 'node:fs';
import { computeOverall, computeScores, verifyScores, SCORE_AREAS } from './collect.mjs';
import { toHtml } from './render.mjs';

let bad = 0;
const ok = (n, c) => { if (c) console.log(`ok   ${n}`); else { bad++; console.error(`FAIL ${n}`); } };
const is = (n, a, b) => ok(`${n} (ждали ${JSON.stringify(b)}, вышло ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b));

const c = (group, status, i = 0) => ({ id: `${group}-${status}-${i}`, group, status, label: group, value: 'x' });

// Веса это решение, а не измерение, но сумма обязана быть сотней, иначе балл не из ста.
is('веса дают ровно сто', SCORE_AREAS.reduce((s, a) => s + a.weight, 0), 100);

// Всё пройдено это сто, всё провалено это ноль.
const every = (status) => SCORE_AREAS.flatMap((a) => a.groups.map((g) => c(g, status)));
is('все проверки пройдены: сто', computeOverall(every('ok')).score, 100);
is('все проверки провалены: ноль', computeOverall(every('bad')).score, 0);
is('все спорные: половина', computeOverall(every('warn')).score, 50);

// Неизмеренная область выкидывается из знаменателя, а не получает ноль. Ноль за то, чего не
// мерили, это неверное измерение, ровно как «0 знаков» вместо «описания у страницы нет».
{
  const partial = [c('technical', 'ok'), c('geo', 'ok')];
  const o = computeOverall(partial);
  is('измеренное на отлично даёт сто даже при неполном покрытии', o.score, 100);
  is('в знаменатель попали только измеренные веса', o.weighed, 40);
  ok('и отчёт об этом говорит', /40 of 100 points were measurable/.test(o.note));
  ok('неизмеренные области в разбивку не попали', o.parts.length === 2);
}

// Пустой аудит не выдаёт ноль: нечего мерить это не то же самое, что всё плохо.
{
  const o = computeOverall([]);
  is('пустой набор проверок не даёт нуля', o.score, null);
  is('и называется неизмеренным', o.grade, 'not measured');
}

// Проверки со статусом na не считаются ни в плюс, ни в минус.
{
  const withNa = [c('technical', 'ok'), { ...c('technical', 'na'), status: 'na' }];
  is('na не портит и не улучшает балл', computeOverall(withNa).score, 100);
}

// Балл в отчёте обязан сходиться с проверками этого же отчёта.
{
  const audit = JSON.parse(readFileSync(new URL('../examples/sample-audit.json', import.meta.url), 'utf8'));
  const o = computeOverall(audit.checks || []);
  audit.overall = o;
  const problems = verifyScores(audit);
  ok('честный отчёт проходит проверку', !problems.some((p) => p.startsWith('overall')));
  audit.overall = { ...o, score: (o.score + 7) % 101 };
  ok('подделанный балл ловится', verifyScores(audit).some((p) => p.startsWith('overall')));
}

// Оба языка. Сегодня дважды чинили русскую ветку и оставляли английскую сломанной.
{
  const audit = JSON.parse(readFileSync(new URL('../examples/sample-audit.json', import.meta.url), 'utf8'));
  const expected = computeOverall(audit.checks || []).score;
  for (const [lang, grade, note] of [['en', /Strong|Workable|Weak|Critical/, /Weighted from the areas below/], ['ru', /Сильно|Рабочее состояние|Слабо|Критично/, /Взвешен по областям ниже/]]) {
    audit.meta.lang = lang;
    const html = toHtml(audit, null);
    const num = (html.match(/overall-num[^>]*>(\d+)<span>/) || [])[1];
    is(`${lang}: в отчёте стоит тот же балл, что считают проверки`, Number(num), expected);
    ok(`${lang}: оценка словом на своём языке`, grade.test((html.match(/overall-grade">([^<]*)</) || [])[1] || ''));
    ok(`${lang}: веса напечатаны, балл можно пересчитать руками`, note.test(html));
    ok(`${lang}: в подписи нет чужого языка`, lang === 'en'
      ? !/[А-Яа-яЁё]/.test((html.match(/overall-note">([^<]*)</) || [])[1] || '')
      : !/Weighted|measurable/.test((html.match(/overall-note">([^<]*)</) || [])[1] || ''));
  }
  // Русское склонение: 75 баллов, а не 75 балла.
  audit.meta.lang = 'ru';
  ok('русское склонение «баллов» верное', !/\d+ балла из 100/.test(toHtml(audit, null)));
}

// Шесть областей никуда не делись: общий балл их дополняет, а не заменяет.
{
  const audit = JSON.parse(readFileSync(new URL('../examples/sample-audit.json', import.meta.url), 'utf8'));
  const { scores } = computeScores(audit.checks || []);
  const html = toHtml(audit, null);
  ok('разбивка по областям осталась под общим баллом', Object.keys(scores).every((k) => html.includes('/10') || scores[k] === null));
}

if (bad) { console.error(`\n${bad} тест(ов) упало`); process.exit(1); }
console.log('\nвсе тесты общего балла прошли');
