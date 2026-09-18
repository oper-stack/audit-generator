/**
 * Render audit.json into the OperStack report: A4 pages, print-ready, and optionally a PDF
 * through headless Chrome. Every narrative field is read from the JSON; a field that still
 * holds a {{placeholder}} is rendered highlighted so it cannot ship unnoticed.
 */
import { writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeScores, computeOverall } from './collect.mjs';
import { localiseBasisNote, AREAS_RU } from './i18n.mjs';
import { MESSAGES as VISIBILITY_MESSAGES } from './visibility.mjs';
import { softenHex } from './agency.mjs';
import { renderDemandHtml, demandSourceRow } from './demand.mjs';
import { buildLlmsTxt, buildOrganisationSchema, fixTitlesAndDescriptions } from './handover.mjs';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const isPlaceholder = (s) => typeof s === 'string' && /\{\{[^}]*\}\}/.test(s);
const t = (s) => (isPlaceholder(s) ? `<mark class="todo">${esc(s)}</mark>` : esc(s));

/** Подписи отчёта. Язык берётся из audit.meta.lang, по умолчанию английский. */
const LABELS = {
  en: {
    eyebrowAudit: 'Digital marketing audit', coverTitle: 'SEO, AEO and GEO<br>audit report',
    auditSubject: 'Audit subject', reportDate: 'Report date', auditType: 'Audit type', preparedBy: 'Prepared by',
    reproducible: 'Every status in this report was read from the public site and can be reproduced from it as it stood on the report date.',
    collectedBy: (tool, date) => `Public signals were collected by ${tool} on ${date}. Every status in this report can be reproduced from the site as it stood on that day.`,
    secSummary: 'Executive summary', summaryEyebrow: '01 · Summary', keyTakeaway: 'Key takeaway:', threePriorities: 'Three priorities',
    scorecardFoot: 'These six scores are not a breakdown of the number above and will not add up to it: they count the checks in this report, which go wider than AI visibility. Each score counts the checks in this report: a check that passes scores one, a check that needs attention a half, a failing check nothing. An area marked <strong>not measured</strong> is an area this audit does not test, and is never scored on an impression. Every figure here can be recomputed from section 04 onwards.',
    notMeasured: 'not measured',
    overallLabel: 'AI visibility score',
    grades: { A: 'Strong', B: 'Workable', C: 'Weak', D: 'Poor', E: 'Critical' },
    // Заголовок это то же измерение, что на странице проверки. Подпись обязана это говорить,
    // иначе читатель снова начнёт сводить его с шестью областями ниже.
    // Подпись обязана сказать три вещи: откуда число, что именно успели прочитать, и почему
    // повтор может дать на пункт-другой иначе. Без последнего человек читает разницу как ошибку.
    overallNote: (o) => {
      const read = o.basis ? `It was read from ${o.basis.pages} page${o.basis.pages === 1 ? '' : 's'} of the site${o.basis.sitemapUnchecked ? ', and the sitemap did not answer in time, which is not counted against the score either way' : o.basis.sitemapRead ? ' and its sitemap' : ''}. ` : '';
      const where = o.source === 'visibility:reused'
        ? `This is the same figure you already saw on the free check${o.measuredAt ? ` on ${String(o.measuredAt).slice(0, 10)}` : ''}. It is not measured again here, so the page, the email and this report always carry one number. `
        : 'Measured here by the same code and the same settings as the free check at oper-stack.com/ai-visibility. ';
      const areas = Array.isArray(o.areas) ? o.areas : [];
      const measured = areas.filter((a) => a.measured !== false && a.score !== null);
      const sumUp = areas.length && measured.length < areas.length
        ? `Of the five areas below, ${measured.length} could be measured; they add up to ${measured.reduce((t, a) => t + a.score, 0)} out of ${measured.reduce((t, a) => t + a.max, 0)}, and the score is that same share carried to 100. An area marked not measured is not counted for or against the site. `
        : 'The five areas below add up to it exactly, so you can recompute it by hand. ';
      return `${where}${read}${sumUp}Running the check again can move it by a point or two: a check that answers in time on one run may not on the next, and this score never counts against a site what it could not read.`;
    },
    secondMeasure: 'A second, separate measurement: how this report scores its own checks',
    ofHundred: 'of 100', ofHundredShort: 'OF 100', aiVisibility: 'AI visibility', seoBasics: 'SEO basics',
    enginesHead: 'Readiness by engine', madeOf: 'What the score is made of', worth: 'worth', blockedIn: 'Blocked', colTables: 'Tables', colLinks: 'Links',
    secHandover: 'Files to paste', handoverEyebrow: 'Ready to paste', handoverTitle: 'What to paste', handoverLead: 'Not advice: files. Everything below was assembled from your own pages, so nothing here was invented about your business.', llmsHead: 'llms.txt, the map for AI agents', llmsNote: 'Save this as llms.txt in the root of your site. An answer engine reads it instead of crawling every page.', andMoreInFile: '… the full file is attached to the email', orgHead: 'Organization markup', orgNote: 'Paste this into a script tag of type application/ld+json in the head of your homepage. Every value here was read from your site.', orgMissingHead: 'Fill in yourself', orgMissingNote: 'These fields are not on your site, so we did not invent them. Add them and the markup gets stronger.', metaHead: 'Titles and descriptions', metaMore: (n) => `${n} more page${n === 1 ? '' : 's'} need the same treatment; all of them are in the titles file attached to the email.`, metaNote: 'Length and structure only, not new wording: the suggestion is assembled from the page\u2019s own H1 and first paragraph so it fits the limit. Grey is what is there now, then why it is a problem, then what to put.',
    secRivals: 'Rivals', rivalsEyebrow: 'Rivals', rivalsTitle: 'You and your rivals', pagesReadLabel: 'Pages it let us read', rivalsThin: 'An asterisk marks a score taken from fewer than three pages: it is what the site let us see, not everything it has.', rivalsWithheld: (list) => `${list.join(', ')} answered, but not on every page we asked for, so there is no score: a score that goes up because we read less is not one we will print.`, rivalsRefused: (list) => `Turned a robot away: ${list.join(', ')}. Bot protection answers the same way to an answer engine, so a site that refuses us is also a site an AI cannot read.`,
    rivalsLead: 'The same code read your rivals, asking each for up to ten pages. The row under the score says how many pages each one actually handed over.',
    rivalsFoot: 'A dash means the site did not answer at all, and that is a fact about the site, not a zero we invented.',
    appendixEyebrow: 'Appendix', appendixPages: 'Every page we read', fullListInAppendix: 'The first pages are shown here; every page we read is listed in the appendix at the end.',
    readNote: (read, wanted) => (read === wanted ? `All ${wanted} pages answered and were read.` : `${read} of ${wanted} pages answered and were read; the rest did not answer or the site stopped us.`),
    secOverview: 'Site overview', overviewEyebrow: '02 · Overview', whatSiteIs: 'What the site is', parameter: 'Parameter', value: 'Value', pagesSampled: 'Pages sampled', colUrl: 'URL', colTitle: 'Title', colWords: 'Words',
    secCritical: 'Critical issues', criticalEyebrow: '03 · P0', criticalTitle: 'Critical issues, fix first', whatItCosts: 'What it costs', theFix: 'Fix', noBody: 'This issue has no description in the audit file.', noCritical: 'No critical defects were found in the public signals.',
    secTechnical: 'Technical SEO', technicalEyebrow: '04 · Technical', technicalTitle: 'Technical and on-page checklist', colCheck: 'Check', colStatus: 'Status', colFinding: 'Finding',
    secContent: 'Content and on-page', contentEyebrow: '05 · Content', contentTitle: 'Content and on-page SEO', strengths: 'Strengths', weaknesses: 'Weaknesses', gaps: 'Structural gaps: pages that do not exist yet',
    secAeo: 'AEO and GEO', aeoEyebrow: '06 · AEO / GEO', aeoTitle: 'Answer engines: AEO', aeoLead: 'Whether the site\'s answers can be lifted into "People also ask", AI overviews, ChatGPT and Perplexity.', aeoWorks: 'What already works', aeoBlocks: 'What blocks the wins', recommendation: 'Recommendation:', geoTitle: 'Generative engines: GEO', colSignal: 'Signal', colDetail: 'Detail',
    secOffpage: 'Off-page, conversion, limitations', offpageEyebrow: '07 · Off-page', offpageTitle: 'Off-page and trust', conversionEyebrow: '08 · Conversion', conversionTitle: 'Conversion and UX', colElement: 'Element', limitationsEyebrow: '09 · Limitations', sourcesTitle: 'Where the data comes from', colSource: 'Source', colAccess: 'Access', colWhatRead: 'What was read',
    sourcesFoot: 'Every score in this report is computed from sources marked free. Nothing that costs money is counted in a score, so you can re-run this audit yourself and get the same numbers.',
    limitations: 'Limitations',
    secRoadmap: 'Roadmap', roadmapEyebrow: '10 · Roadmap', demandEyebrow: '11 · Demand', demandTitle: 'Demand map', secDemand: 'Demand', roadmapTitle: 'What to do, in order', keyMessage: 'Key message:',
    runningHead: 'SEO, AEO and GEO audit',
    statusOk: '✓ OK', statusWarn: '△ Partial', statusBad: '✗ Problem', statusNa: '· Note',
    areas: null,
    basisNote: (b) => `${b.ok} of ${b.counted} checks pass${b.warn ? `, ${b.warn} ${b.warn === 1 ? 'needs' : 'need'} attention` : ''}${b.bad ? `, ${b.bad} ${b.bad === 1 ? 'fails' : 'fail'}` : ''}`,
    notMeasuredReason: { 'Off-page and trust': 'no link or mention data was collected', 'Conversion and UX': 'no conversion signals were collected' },
  },
  ru: {
    eyebrowAudit: 'Аудит цифрового маркетинга', coverTitle: 'Аудит сайта:<br>SEO, AEO и GEO',
    auditSubject: 'Что проверяли', reportDate: 'Дата отчёта', auditType: 'Тип аудита', preparedBy: 'Кто готовил',
    reproducible: 'Каждый статус в этом отчёте прочитан с публичного сайта, и его можно перепроверить по сайту на дату отчёта.',
    collectedBy: (tool, date) => `Публичные сигналы собраны инструментом ${tool} ${date}. Любой статус в этом отчёте можно перепроверить по сайту в том виде, в каком он был в этот день.`,
    secSummary: 'Главное', summaryEyebrow: '01 · Итог', keyTakeaway: 'Главный вывод:', threePriorities: 'Три приоритета',
    scorecardFoot: 'Эти шесть оценок не разбивка балла выше и в сумме его не дают: они считают проверки самого отчёта, а он шире, чем видимость в ИИ. Каждая оценка считает проверки из этого же отчёта: пройденная проверка это балл, спорная половина балла, проваленная ноль. Область с пометкой <strong>не измерялось</strong> это область, которую аудит не проверяет, и она никогда не оценивается на глаз. Любую цифру отсюда можно пересчитать по разделам начиная с четвёртого.',
    notMeasured: 'не измерялось',
    overallLabel: 'Балл видимости в ИИ',
    grades: { A: 'Сильно', B: 'Рабочее состояние', C: 'Слабо', D: 'Плохо', E: 'Критично' },
    overallNote: (o) => {
      const p = o.basis ? o.basis.pages : 0;
      const pl = ruPages(p);
      const read = o.basis ? `Прочитано ${p} ${pl} сайта${o.basis.sitemapUnchecked ? ', а карта сайта не ответила вовремя, и это не зачтено ни в плюс, ни в минус' : o.basis.sitemapRead ? ' и его карта' : ''}. ` : '';
      const where = o.source === 'visibility:reused'
        ? `Это ровно то число, которое вы уже видели в бесплатной проверке${o.measuredAt ? ` ${String(o.measuredAt).slice(0, 10)}` : ''}. Здесь оно не меряется заново, поэтому страница, письмо и этот отчёт всегда несут одно число. `
        : 'Измерено здесь тем же кодом и с теми же настройками, что у бесплатной проверки на oper-stack.ru/ai-visibility. ';
      const areas = Array.isArray(o.areas) ? o.areas : [];
      const measured = areas.filter((a) => a.measured !== false && a.score !== null);
      const sumUp = areas.length && measured.length < areas.length
        ? `Из пяти областей ниже измерены ${measured.length}, они дают ${measured.reduce((t, a) => t + a.score, 0)} из ${measured.reduce((t, a) => t + a.max, 0)}, и балл это та же доля, перенесённая на сто. Область с пометкой «не измерялось» не зачтена ни в плюс, ни в минус. `
        : 'Пять областей ниже дают в сумме ровно этот балл, его можно сложить руками. ';
      return `${where}${read}${sumUp}Повторная проверка может дать на пункт-другой иначе: проверка, которая успела ответить в один прогон, может не успеть в следующий, а балл никогда не засчитывает сайту в минус то, что не удалось прочитать.`;
    },
    secondMeasure: 'Второе, отдельное измерение: как этот отчёт оценивает собственные проверки',
    ofHundred: 'из 100', ofHundredShort: 'ИЗ 100', aiVisibility: 'ИИ-видимость', seoBasics: 'Основы SEO',
    enginesHead: 'Готовность по движкам', madeOf: 'Из чего сложился балл', worth: 'вес', blockedIn: 'Закрыты', colTables: 'Таблиц', colLinks: 'Ссылок',
    secHandover: 'Что вставить', handoverEyebrow: 'Готово к вставке', handoverTitle: 'Что вставить', handoverLead: 'Не советы, а файлы. Всё ниже собрано с ваших же страниц, поэтому ничего про ваш бизнес здесь не выдумано.', llmsHead: 'llms.txt, карта для агентов ИИ', llmsNote: 'Сохраните это файлом llms.txt в корне сайта. Ответная система читает его вместо того, чтобы обходить все страницы.', andMoreInFile: '… файл целиком приложен к письму', orgHead: 'Разметка организации', orgNote: 'Вставьте это в тег script с типом application/ld+json в head главной страницы. Каждое значение здесь прочитано с вашего сайта.', orgMissingHead: 'Впишите сами', orgMissingNote: 'Этих полей на сайте нет, и мы их не выдумывали. Впишите, и разметка станет сильнее.', metaHead: 'Заголовки и описания', metaMore: (n) => `Ещё ${n} странице${n === 1 ? '' : 'й'} нужна такая же правка, все они есть в файле с заголовками, приложенном к письму.`, metaNote: 'Чинится длина и структура, а не смысл: предложенный вариант собран из собственного H1 страницы и её первого абзаца так, чтобы уложиться в лимит. Серым то, что стоит сейчас, ниже чем это плохо, ниже что поставить.',
    secRivals: 'Конкуренты', rivalsEyebrow: 'Конкуренты', rivalsTitle: 'Вы и ваши конкуренты', pagesReadLabel: 'Сколько страниц дал прочитать', rivalsThin: 'Звёздочкой помечен балл, посчитанный меньше чем по трём страницам: это то, что сайт дал посмотреть, а не всё, что у него есть.', rivalsWithheld: (list) => `${list.join(', ')} ответил, но не на все запрошенные страницы, поэтому балла нет: балл, который растёт оттого, что мы прочитали меньше, мы не печатаем.`, rivalsRefused: (list) => `Развернули робота: ${list.join(', ')}. Защита от ботов так же отвечает и ответной системе, поэтому сайт, который не пустил нас, не пустит и ИИ.`,
    rivalsLead: 'Конкурентов читал тот же код и просил у каждого до десяти страниц. Строка под баллом говорит, сколько страниц каждый сайт отдал на самом деле.',
    rivalsFoot: 'Прочерк значит, что сайт не ответил вовсе, и это факт про сайт, а не выдуманный нами ноль.',
    appendixEyebrow: 'Приложение', appendixPages: 'Все прочитанные страницы', fullListInAppendix: 'Здесь первые строки, весь список прочитанных страниц лежит приложением в конце отчёта.',
    readNote: (read, wanted) => (read === wanted ? `Ответили и прочитаны все ${wanted} страниц.` : `Из ${wanted} страниц ответили и прочитаны ${read}; остальные не ответили или сайт нас остановил.`),
    secOverview: 'О сайте', overviewEyebrow: '02 · Обзор', whatSiteIs: 'Что это за сайт', parameter: 'Параметр', value: 'Значение', pagesSampled: 'Проверенные страницы', colUrl: 'Адрес', colTitle: 'Заголовок', colWords: 'Слов',
    secCritical: 'Критичное', criticalEyebrow: '03 · Срочно', criticalTitle: 'Что чинить первым', whatItCosts: 'Чем это грозит', theFix: 'Как чинится', noBody: 'У этой проблемы нет описания в файле аудита.', noCritical: 'Критичных дефектов в публичных сигналах не найдено.',
    secTechnical: 'Техническое SEO', technicalEyebrow: '04 · Техника', technicalTitle: 'Техническая проверка и страницы', colCheck: 'Проверка', colStatus: 'Статус', colFinding: 'Что нашли',
    secContent: 'Контент и страницы', contentEyebrow: '05 · Контент', contentTitle: 'Контент и внутренняя оптимизация', strengths: 'Сильные стороны', weaknesses: 'Слабые места', gaps: 'Структурные дыры: страниц, которых пока нет',
    secAeo: 'AEO и GEO', aeoEyebrow: '06 · AEO / GEO', aeoTitle: 'Ответные системы: AEO', aeoLead: 'Может ли ответ с вашего сайта попасть в блок «Люди также спрашивают», в ответы ИИ, в ChatGPT и Perplexity.', aeoWorks: 'Что уже работает', aeoBlocks: 'Что мешает', recommendation: 'Рекомендация:', geoTitle: 'Генеративные системы: GEO', colSignal: 'Сигнал', colDetail: 'Подробности',
    secOffpage: 'Ссылки, конверсия, ограничения', offpageEyebrow: '07 · Ссылки', offpageTitle: 'Ссылки и доверие', conversionEyebrow: '08 · Конверсия', conversionTitle: 'Конверсия и удобство', colElement: 'Элемент', limitationsEyebrow: '09 · Ограничения', sourcesTitle: 'Откуда взяты данные', colSource: 'Источник', colAccess: 'Доступ', colWhatRead: 'Что прочитали',
    sourcesFoot: 'Каждая оценка в этом отчёте посчитана из источников с пометкой «бесплатно». Ничего платного ни в одну оценку не входит, поэтому вы можете повторить этот аудит сами и получить те же цифры.',
    limitations: 'Ограничения',
    secRoadmap: 'План работ', roadmapEyebrow: '10 · План', demandEyebrow: '11 · Спрос', demandTitle: 'Карта спроса', secDemand: 'Спрос', roadmapTitle: 'Что делать и в каком порядке', keyMessage: 'Главное сообщение:',
    runningHead: 'Аудит SEO, AEO и GEO',
    statusOk: '✓ Норма', statusWarn: '△ Частично', statusBad: '✗ Проблема', statusNa: '· Заметка',
    areas: AREAS_RU,
    basisNote: (b) => localiseBasisNote(`${b.ok} of ${b.counted} checks pass${b.warn ? `, ${b.warn} ${b.warn === 1 ? 'needs' : 'need'} attention` : ''}${b.bad ? `, ${b.bad} ${b.bad === 1 ? 'fails' : 'fail'}` : ''}`),
    notMeasuredReason: { 'Off-page and trust': 'данные по ссылкам и упоминаниям не собирались', 'Conversion and UX': 'сигналы конверсии не собирались' },
  },
};

const STATUS_KEYS = { ok: 'statusOk', warn: 'statusWarn', bad: 'statusBad', na: 'statusNa' };
const STATUS_CLASS = { ok: 'status-ok', warn: 'status-warn', bad: 'status-bad', na: 'status-na' };
const STATUS_UNUSED = { ok: ['✓ OK', 'status-ok'], warn: ['△ Partial', 'status-warn'], bad: ['✗ Problem', 'status-bad'], na: ['· Note', 'status-na'] };
/** Склонение «страница»: 1 страница, 4 страницы, 5 страниц. Подпись под баллом читает человек. */
const ruPages = (n) => { const a = Math.abs(n) % 100; const b = a % 10; if (a > 10 && a < 20) return 'страниц'; if (b === 1) return 'страница'; if (b >= 2 && b <= 4) return 'страницы'; return 'страниц'; };

/** Склонение «балл» для русской подписи под общим баллом: 21 балл, 72 балла, 75 баллов. */
const ruPoints = (n) => { const a = Math.abs(n) % 100; const b = a % 10; if (a > 10 && a < 20) return 'баллов'; if (b === 1) return 'балл'; if (b >= 2 && b <= 4) return 'балла'; return 'баллов'; };

const scoreClass = (n) => (n === null || n === undefined ? '' : n <= 3 ? 'low' : n <= 6 ? 'mid' : 'ok');

/**
 * Балл видимости и всё, что про него надо сказать словами, одним объектом.
 *
 * Простым языком: это тот самый блок, который стоит на первой странице отчёта. Письмо печатает
 * его же. Раньше письмо собирало свою формулировку и свою цифру, и человек получал на странице
 * одно, в письме другое, а в PDF третье. Теперь текст ровно один и живёт здесь.
 *
 * Названия областей берутся по `id`, а не по готовой подписи из замера: замер мог пройти на
 * английской странице, а отчёт уходить русскому покупателю, и тогда подпись пришла бы на чужом
 * языке. Язык отчёта главнее языка замера.
 *
 * Возвращает null, если балла нет: движок отказывается мерить закрытые и приватные адреса, и в
 * этом случае честнее не называть цифру вовсе, чем подставить ноль.
 */
export function overallSummary(overall, { lang = 'en' } = {}) {
  if (!overall || overall.score === null || overall.score === undefined) return null;
  const key = lang === 'ru' ? 'ru' : 'en';
  const L = LABELS[key];
  const names = VISIBILITY_MESSAGES[key].area;
  return {
    label: L.overallLabel,
    score: overall.score,
    grade: (L.grades && L.grades[overall.grade]) || overall.grade,
    note: L.overallNote(overall),
    areas: (Array.isArray(overall.areas) ? overall.areas : []).map((x) => ({
      id: x.id, label: (x.id && names[x.id]) || x.label,
      // Неизмеренная область несёт null, а не ноль: ноль это утверждение, что там плохо.
      score: x.measured === false ? null : x.score, max: x.max, measured: x.measured !== false,
    })),
    notMeasured: L.notMeasured,
    secondMeasure: L.secondMeasure,
    secondMeasureFoot: L.scorecardFoot.replace(/<\/?strong>/g, ''),
  };
}

export function checkNarrative(audit) {
  const out = [];
  const walk = (v, path) => {
    if (typeof v === 'string') { if (isPlaceholder(v)) out.push(path); }
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
  };
  for (const k of ['client', 'summary', 'overview', 'critical', 'content', 'aeo', 'geo', 'offpage', 'conversion', 'roadmap', 'closing']) walk(audit[k], k);
  (audit.critical || []).forEach((c, i) => { if (!c.text && !c.cost && !c.fix) out.push(`critical[${i}].text (the issue "${c.title || '?'}" would print as a bare headline)`); });
  return out;
}

function css() {
  return `
  @page { size: A4; margin: 0; }
  :root { --ink:#14181c; --ink-2:#3b474d; --muted:#5c6b6f; --rule:#d8dedb; --paper:#fff; --panel:#f3f5f6; --accent:#0b7a75; --accent-soft:#dcefed; --gold:#8a6b38; --gold-soft:#f5efe3; --danger:#b3261e; --warn:#9a6700; --ok:#1f7a3d; --pad:16mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "IBM Plex Sans", "Helvetica Neue", Helvetica, Arial, sans-serif; color: var(--ink); background: #e9ecec; font-size: 10.2pt; line-height: 1.5; }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto 8mm; background: var(--paper); padding: var(--pad) var(--pad) 20mm; position: relative; page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  h1, h2, h3 { font-family: "Fraunces", "Iowan Old Style", Georgia, serif; font-weight: 600; color: var(--ink); line-height: 1.15; }
  h2 { font-size: 19pt; margin-bottom: 4mm; padding-bottom: 2mm; border-bottom: 2px solid var(--accent-soft); }
  h3 { font-size: 11.5pt; margin: 6mm 0 2.5mm; }
  p { margin-bottom: 3mm; color: var(--ink-2); }
  p.lead { font-size: 11pt; color: var(--ink); }
  ul, ol { margin: 0 0 4mm 5mm; color: var(--ink-2); } li { margin-bottom: 1.5mm; }
  .eyebrow { font-size: 8pt; letter-spacing: .12em; text-transform: uppercase; color: var(--accent); font-weight: 600; margin-bottom: 2mm; }
  .cover { min-height: calc(297mm - 38mm); display: flex; flex-direction: column; justify-content: space-between; }
  .cover-top { border-top: 3px solid var(--accent); padding-top: 8mm; }
  .cover-logo { display: block; max-height: 16mm; max-width: 70mm; margin-bottom: 7mm; }
  .cover h1 { font-size: 34pt; margin: 2mm 0 4mm; }
  .cover-sub { font-size: 13pt; color: var(--ink-2); max-width: 85%; margin-bottom: 10mm; }
  .cover-url { display: inline-block; background: var(--accent-soft); color: var(--accent); padding: 2.5mm 4.5mm; border-radius: 4px; font-weight: 600; font-size: 11pt; }
  /* Шапка первого листа вместо обложки: те же поля, но одной строкой и мелким кеглем. */
  .masthead { border-top: 3px solid var(--accent); padding-top: 3.5mm; margin-bottom: 3.5mm; }
  .masthead .cover-logo { max-height: 9mm; margin-bottom: 2.5mm; }
  .mast-eyebrow { font-size: 7.5pt; letter-spacing: .12em; text-transform: uppercase; color: var(--accent); font-weight: 600; margin: 0 0 1.5mm; }
  .mast-title { font-family: "Fraunces", Georgia, serif; font-size: 20pt; line-height: 1.08; margin: 0 0 2mm; font-weight: 600; }
  .mast-sub { font-size: 9pt; color: var(--ink-2); line-height: 1.45; margin: 0 0 2.5mm; max-width: 150mm; }
  .mast-meta { display: grid; grid-template-columns: repeat(4, auto); gap: 0 9mm; justify-content: start; border-top: 1px solid var(--rule); padding-top: 2.5mm; }
  .mast-meta dt { font-size: 6.8pt; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 0 0 .6mm; }
  .mast-meta dd { font-size: 8.5pt; font-weight: 600; margin: 0; }

  /* Таблица конкурентов: свой сайт выделен, лучшее в строке подсвечено. */
  table.rivals-table { table-layout: fixed; font-size: 8.8pt; }
  table.rivals-table th, table.rivals-table td { padding-left: 1.4mm; padding-right: 1.4mm; }
  table.rivals-table th:first-child, table.rivals-table td:first-child { width: 23%; }
  table.rivals-table th.n, table.rivals-table td.n { text-align: center; font-variant-numeric: tabular-nums; }
  table.rivals-table th.n { font-size: 6.8pt; letter-spacing: 0; text-transform: none; overflow-wrap: normal; word-break: normal; }
  table.rivals-table th.mine { color: var(--accent); }
  table.rivals-table td.beat { color: var(--ok); font-weight: 600; }
  table.rivals-table td .na { color: var(--muted); }
  table.rivals-table tr.lead-row td { font-family: "Fraunces", Georgia, serif; font-size: 13pt; }
  table.rivals-table tr.foot-row td { color: var(--muted); font-size: 8pt; }
  table.rivals-table td span { font-size: 8pt; color: var(--muted); }

  /* Раздел «что вставить»: код мелко и моноширинно, чтобы копировался без потерь. */
  .handover-page .hand-note { font-size: 8.5pt; color: var(--muted); line-height: 1.45; margin: 0 0 3mm; }
  pre.code { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 7.5pt; line-height: 1.5; background: #fafbfb; border: 1px solid var(--rule); border-radius: 4px; padding: 3mm 4mm; white-space: pre-wrap; word-break: break-word; margin: 0 0 4mm; }
  ul.hand-missing { margin: 0; padding-left: 5mm; font-size: 9pt; }
  ul.hand-missing code { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 8pt; color: var(--accent); }
  table.meta-fixes td { vertical-align: top; font-size: 8.5pt; }
  table.meta-fixes .was { color: var(--muted); }
  table.meta-fixes .why { color: var(--warn); font-size: 7.5pt; }
  table.meta-fixes .now { color: var(--ink); font-weight: 600; }
  .tool-line { font-size: 7.5pt; color: var(--muted); line-height: 1.4; margin: 4mm 0 0; }
  .cover-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; margin-top: 14mm; padding-top: 6mm; border-top: 1px solid var(--rule); }
  .cover-meta dt { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin-bottom: 1mm; }
  .cover-meta dd { font-size: 11pt; font-weight: 600; }
  .cover-foot { font-size: 8.5pt; color: var(--muted); border-top: 1px solid var(--rule); padding-top: 4mm; }
  .page-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 3mm; margin-bottom: 6mm; border-bottom: 1px solid var(--rule); font-size: 8pt; color: var(--muted); }
  .page-header strong { color: var(--accent); }
  .page-footer { position: absolute; bottom: 9mm; left: var(--pad); right: var(--pad); display: flex; justify-content: space-between; font-size: 8pt; color: var(--muted); border-top: 1px solid var(--rule); padding-top: 2.5mm; }
  table.areas { border-collapse: collapse; width: 100%; margin: -2mm 0 5mm; font-size: 8.5pt; }
  table.areas th { background: #eef4f4; color: var(--muted); font-weight: 500; text-transform: uppercase; letter-spacing: .05em; font-size: 7.5pt; padding: 2mm 2.5mm; text-align: center; border: 1px solid var(--rule); }
  table.areas td { text-align: center; padding: 2.5mm; border: 1px solid var(--rule); font-family: "Fraunces", Georgia, serif; font-size: 13pt; font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }
  table.areas td span { font-family: inherit; font-size: 9pt; color: var(--muted); font-weight: 400; }
  h3.second-measure { font-size: 11pt; margin: 7mm 0 3mm; }
  /*
   * Сводка: кольцо, пилюли, полосы. Те же пороги цвета, что на странице результата: 80 и 45.
   * Печать на бумагу, поэтому все размеры в миллиметрах и пунктах, а не в пикселях.
   */
  .overall { display: flex; align-items: center; gap: 7mm; border: 1px solid var(--rule); border-radius: 5px; padding: 3.5mm 6mm; background: #fafbfb; margin: 4mm 0 3mm; }
  .ring { flex: none; color: var(--ok); }
  .ring.ring-fair { color: #d9a030; } .ring.ring-poor { color: #d2694f; } .ring.ring-na { color: var(--muted); }
  .ring-num { font-family: "Fraunces", Georgia, serif; font-size: 42px; font-weight: 600; fill: var(--ink); }
  .ring-of { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 11px; letter-spacing: 1px; fill: var(--muted); }
  .overall-side { min-width: 0; }
  .pills { display: flex; flex-wrap: wrap; gap: 2mm; margin: 0 0 2.5mm; }
  .pill { display: inline-flex; align-items: baseline; gap: 1.6mm; padding: 1.4mm 3mm; border-radius: 99mm; background: var(--accent-soft); font-size: 7.5pt; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
  .pill-fair { background: #fbf0d5; } .pill-poor { background: #f9e1db; } .pill-na { background: #eceef0; }
  .pill b { font-family: "Fraunces", Georgia, serif; font-size: 12pt; letter-spacing: 0; color: var(--ok); }
  .pill-fair b { color: #9a6700; } .pill-poor b { color: #b3261e; } .pill-na b { color: var(--muted); }
  .pill-n { color: var(--ink-2); }
  .overall-grade { font-family: "Fraunces", Georgia, serif; font-size: 14pt; font-weight: 600; margin: 0 0 1.5mm; }
  .overall-note { font-size: 8.5pt; color: var(--muted); line-height: 1.45; margin: 0; }

  h3.engines-head, h3.areas-head { font-size: 11pt; margin: 4mm 0 2mm; }
  .engines { display: grid; grid-template-columns: repeat(5, 1fr); gap: 2.2mm; }
  .eng { border: 1px solid var(--rule); border-radius: 4px; padding: 2.4mm 2.6mm; background: #fafbfb; }
  .eng p { margin: 0; }
  .eng-name { font-size: 8pt; font-weight: 600; }
  .eng-num { font-family: "Fraunces", Georgia, serif; font-size: 16pt; line-height: 1; color: var(--ok); margin: 0.6mm 0 1.4mm; font-variant-numeric: tabular-nums; }
  .eng-fair .eng-num { color: #9a6700; } .eng-poor .eng-num { color: #b3261e; } .eng-na .eng-num { color: var(--muted); }
  .eng-how { font-size: 6.2pt; color: var(--muted); line-height: 1.3; margin-top: 1.4mm; }
  .eng-poor .eng-how { color: #b3261e; }

  .pbar { height: 1.3mm; border-radius: 1mm; background: #ecefee; overflow: hidden; }
  .pbar i { display: block; height: 100%; background: var(--ok); }
  .eng-fair .pbar i, .ar-fair .pbar i { background: #e8b84a; }
  .eng-poor .pbar i, .ar-poor .pbar i { background: #d2694f; }
  .eng-na .pbar i, .ar-na .pbar i { background: var(--muted); }

  .areas-bars { margin-bottom: 2mm; }
  .ar { padding: 1.6mm 0; border-top: 1px solid var(--rule); }
  .ar:first-child { border-top: 0; padding-top: 0.5mm; }
  .ar-h { display: grid; grid-template-columns: 1fr auto auto; gap: 3mm; align-items: baseline; margin-bottom: 1.4mm; }
  .ar-n { font-size: 9pt; font-weight: 600; }
  .ar-w { font-size: 7pt; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); }
  .ar-v { font-family: "Fraunces", Georgia, serif; font-size: 13pt; color: var(--ok); font-variant-numeric: tabular-nums; min-width: 14mm; text-align: right; }
  .ar-fair .ar-v { color: #9a6700; } .ar-poor .ar-v { color: #b3261e; }
  .ar-v span { font-size: 8pt; color: var(--muted); }
  .ar-v .na { font-family: inherit; font-size: 8pt; color: var(--muted); }

  .scorecard { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; margin: 5mm 0 6mm; }
  .score { border: 1px solid var(--rule); border-radius: 4px; padding: 3.5mm 4mm; background: #fafbfb; }
  .score .label { font-size: 8pt; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin-bottom: 1.5mm; }
  .score-row { display: flex; align-items: center; justify-content: space-between; gap: 3mm; }
  .score-num { font-family: "Fraunces", Georgia, serif; font-size: 22pt; font-weight: 600; color: var(--accent); line-height: 1; font-variant-numeric: tabular-nums; }
  .score-num.low { color: var(--danger); } .score-num.mid { color: var(--warn); } .score-num.ok { color: var(--ok); }
  .score-note { font-size: 8.5pt; color: var(--muted); flex: 1; text-align: right; }
  .score-num.na { font-family: inherit; font-size: 10pt; font-weight: 600; color: var(--muted); letter-spacing: .02em; }
  .scorecard-foot { font-size: 8.5pt; color: var(--muted); margin: -3mm 0 6mm; }
  .verdict { background: var(--ink); color: #e8ecef; border-radius: 4px; padding: 5mm 6mm; margin: 5mm 0; }
  .verdict p { color: #e8ecef; margin: 0; }
  table { width: 100%; border-collapse: collapse; margin: 3mm 0 5mm; font-size: 9.2pt; }
  th { text-align: left; padding: 2.5mm 3mm; font-size: 7.8pt; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); border-bottom: 2px solid var(--ink); font-weight: 600; }
  td { padding: 2.2mm 3mm; border-bottom: 1px solid var(--rule); vertical-align: top; }
  .status-ok { color: var(--ok); font-weight: 600; white-space: nowrap; } .status-warn { color: var(--warn); font-weight: 600; white-space: nowrap; } .status-bad { color: var(--danger); font-weight: 600; white-space: nowrap; }
  .kpis { display: flex; gap: 4mm; margin: 4mm 0 5mm; }
  .kpi { flex: 1; background: var(--panel); border-radius: 4px; padding: 3mm 4mm; }
  .kpi-value { font-family: "Fraunces", "Iowan Old Style", Georgia, serif; font-size: 17pt; font-weight: 600; color: var(--ink); line-height: 1.1; }
  .kpi-label { font-size: 8.5pt; color: var(--muted); margin-top: 1mm; }
  table.pages.appendix { table-layout: fixed; }
  table.pages.appendix td, table.pages.appendix th { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  table.pages.appendix td:nth-child(1), table.pages.appendix th:nth-child(1) { width: 33%; }
  table.pages.appendix td:nth-child(2), table.pages.appendix th:nth-child(2) { width: 35%; }
  table.pages.appendix td:nth-child(n+3), table.pages.appendix th:nth-child(n+3) { width: 8%; text-align: right; font-variant-numeric: tabular-nums; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; } .status-na { color: var(--muted); }
  .cards { display: grid; gap: 3mm; margin: 4mm 0; }
  .card { border-left: 3px solid var(--danger); background: #fbf1f0; padding: 3.5mm 4mm; border-radius: 0 4px 4px 0; }
  .card.warn { border-left-color: var(--warn); background: #fdf8ee; }
  .card h4 { font-size: 10pt; margin-bottom: 1.5mm; } .card p { font-size: 9.3pt; margin: 0 0 1.5mm; } .card p:last-child { margin-bottom: 0; }
  .card-tag { display: inline-block; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin-right: 2mm; }
  .card-empty { color: var(--danger); font-style: italic; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
  .callout { background: var(--gold-soft); border-radius: 4px; padding: 4mm 5mm; margin: 4mm 0; border: 1px solid #e8dcc8; }
  .callout p { color: var(--ink); margin: 0; font-size: 9.5pt; }
  .phase { margin-bottom: 5mm; } .phase-head { display: flex; align-items: center; gap: 3mm; margin-bottom: 2.5mm; }
  .badge { background: var(--accent); color: #fff; font-size: 7.8pt; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; padding: 1mm 2.5mm; border-radius: 3px; white-space: nowrap; }
  .phase-title { font-weight: 700; font-size: 10.5pt; }
  .todo { background: #ffe58a; color: #5b4300; padding: 0 .3em; }
  code { font-family: "IBM Plex Mono", Menlo, monospace; font-size: 8.8pt; background: var(--panel); padding: 0 .3em; border-radius: 2px; }
  @media print { body { background: #fff; } .page { margin: 0; } }
  `;
}

const header = (audit, section, L) => `<div class="page-header"><strong>${esc(audit.client.name)}</strong><span>${esc(L.runningHead)} · ${esc(section)}</span></div>`;
const footer = (audit, n, by) => `<div class="page-footer"><span>${esc(by || audit.client.preparedBy || 'OperStack')} · ${esc(audit.client.reportDate)}</span><span>${n}</span></div>`;
const list = (items) => `<ul>${(items || []).map((i) => `<li>${t(i)}</li>`).join('')}</ul>`;
const olist = (items) => `<ol>${(items || []).map((i) => `<li>${t(i)}</li>`).join('')}</ol>`;
const statusCell = (s, L) => `<td class="${STATUS_CLASS[s] || STATUS_CLASS.na}">${L[STATUS_KEYS[s] || 'statusNa']}</td>`;

export function toHtml(audit, brand = null) {
  // Цвет агентства подменяет только акцент: остальная палитра отчёта остаётся выверенной.
  const accentCss = brand && brand.accent ? `:root{--accent:${brand.accent};--accent-soft:${softenHex(brand.accent)};}` : '';
  const a = audit;
  const L = LABELS[a.meta?.lang === 'ru' ? 'ru' : 'en'];
  const groups = [['technical', 'Technical'], ['onpage', 'On-page'], ['content', 'Content'], ['aeo', 'Answer engines'], ['geo', 'Generative engines'], ['offpage', 'Off-page and trust'], ['conversion', 'Conversion'], ['overview', 'Overview']];
  const checksBy = (g) => (a.checks || []).filter((c) => c.group === g);
  const { scores: measured, scoreBasis } = computeScores(a.checks || []);
  /*
   * Заголовок отчёта это тот же балл видимости, который человек увидел на странице бесплатной
   * проверки, и он приходит готовым из `audit.overall`: пересчитывать его здесь нельзя, иначе
   * снова получатся два числа про один сайт. Под ним его же пять областей, которые дают в сумме
   * ровно заголовок, чтобы читатель мог сложить их и сойтись.
   *
   * Шесть областей отчёта печатаются ниже отдельным блоком и с другой подписью: это второе,
   * независимое измерение по проверкам самого отчёта, а не разбивка заголовка. Сводить их с
   * заголовком не нужно и не получится, и об этом сказано словами.
   */
  const head = overallSummary(a.overall, { lang: a.meta?.lang === 'ru' ? 'ru' : 'en' });
  /*
   * Сводка на языке, которым с 17.09.2026 говорит страница результата: кольцо со шкалой, две
   * пилюли с числами, полосы по областям, цвет по значению. До этого здесь были плоские числа в
   * таблице, и владелец сказал прямо, что бесплатная страница выглядит лучше платного отчёта.
   *
   * Цвет считается одним правилом на весь отчёт, теми же порогами, что у буквы: 80 и 45.
   */
  const tone = (pct) => (pct === null ? 'na' : pct >= 80 ? 'good' : pct >= 45 ? 'fair' : 'poor');
  const RING_R = 58;
  const RING_C = 2 * Math.PI * RING_R;
  const ring = (score) => `<svg class="ring ring-${tone(score)}" viewBox="0 0 148 148" width="104" height="104" role="img" aria-label="${score} ${esc(L.ofHundred || 'of 100')}">
      <circle cx="74" cy="74" r="${RING_R}" fill="none" stroke="#ECE9E2" stroke-width="12"/>
      <circle cx="74" cy="74" r="${RING_R}" fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="round"
              stroke-dasharray="${RING_C.toFixed(1)}" stroke-dashoffset="${(RING_C * (1 - score / 100)).toFixed(1)}" transform="rotate(-90 74 74)"/>
      <text class="ring-num" x="74" y="80" text-anchor="middle">${score}</text>
      <text class="ring-of" x="74" y="101" text-anchor="middle">${esc(L.ofHundredShort || 'OF 100')}</text>
    </svg>`;
  const grade100 = (n) => (n >= 80 ? 'A' : n >= 65 ? 'B' : n >= 45 ? 'C' : n >= 25 ? 'D' : 'E');
  const pill = (label, score) => `<span class="pill pill-${tone(score)}"><span class="pill-k">${esc(label)}</span> <b>${grade100(score)}</b> <span class="pill-n">${score}/100</span></span>`;
  const seo = a.overall && a.overall.seo && typeof a.overall.seo.score === 'number' ? a.overall.seo : null;
  const engines = Array.isArray(a.overall && a.overall.engines) ? a.overall.engines : [];

  const overallBlock = !head ? '' : `<div class="overall">
      ${ring(head.score)}
      <div class="overall-side">
        <p class="pills">${pill(L.aiVisibility || 'AI visibility', head.score)}${seo ? pill(L.seoBasics || 'SEO basics', seo.score) : ''}</p>
        <div class="overall-grade">${esc(head.grade)}</div>
        <p class="overall-note">${esc(head.note)}</p>
      </div>
    </div>`
    + (engines.length ? `<h3 class="engines-head">${esc(L.enginesHead || 'Readiness by engine')}</h3><div class="engines">${engines.map((e) => {
        const v = e.score === null ? 0 : e.score;
        return `<div class="eng eng-${tone(e.score)}"><p class="eng-name">${esc(e.label)}</p><p class="eng-num">${e.score === null ? '&middot;' : e.score}</p><div class="pbar"><i style="width:${v}%"></i></div><p class="eng-how">${esc(e.blocked && e.blocked.length ? `${L.blockedIn || 'Blocked'}: ${e.blocked.join(', ')}` : e.how)}</p></div>`;
      }).join('')}</div>` : '')
    + (head.areas.length ? `<h3 class="areas-head">${esc(L.madeOf || 'What the score is made of')}</h3><div class="areas-bars">${head.areas.map((x) => {
        const pct = x.score === null || !x.max ? null : Math.round((x.score / x.max) * 100);
        return `<div class="ar ar-${tone(pct)}"><div class="ar-h"><span class="ar-n">${esc(x.label)}</span><span class="ar-w">${esc((L.worth || 'worth') + ' ' + x.max)}</span><span class="ar-v">${x.score === null ? `<span class="na">${esc(head.notMeasured)}</span>` : `${x.score}<span>/${x.max}</span>`}</span></div><div class="pbar"><i style="width:${pct === null ? 0 : pct}%"></i></div></div>`;
      }).join('')}</div>` : '');
  const scoreCards = Object.entries(measured).map(([label, n]) => {
    const basis = scoreBasis[label] || {};
    const shown = (L.areas && L.areas[label]) || label;
    const num = n === null ? `<span class="score-num na">${L.notMeasured}</span>` : `<span class="score-num ${scoreClass(n)}">${n}/10</span>`;
    const note = n === null
      ? (L.notMeasuredReason && L.notMeasuredReason[label]) || String(basis.note || '').replace(/^not measured:\s*/, '')
      : (basis.counted ? L.basisNote(basis) : basis.note || '');
    return `<div class="score"><div class="label">${esc(shown)}</div><div class="score-row">${num}<span class="score-note">${esc(note)}</span></div></div>`;
  }).join('');
  let n = 1;
  const pages = [];
  const logo = brand && brand.logo ? `<img class="cover-logo" src="${brand.logo}" alt="">` : '';
  const preparedBy = (brand && brand.preparedBy) || a.client.preparedBy || 'OperStack';
  /*
   * Обложки отдельным листом больше нет: заголовок уменьшен и стоит шапкой первого листа.
   *
   * Лист, на котором только название и четыре поля, в отчёте на двенадцать страниц никто не
   * читает. Замерено перед правкой: содержимое ровно влезает в лист, перелива ноль. Строка про
   * предмет обрезается по длине, иначе длинное описание чужого сайта вытолкнет низ листа на
   * следующую страницу, и мы вернёмся к тому, от чего уходили.
   */
  const subjectText = t(a.client.subject);
  /* Обрыв на полуслове в первой строке отчёта за 149 выглядит как недоделка, поэтому режем по точке. */
  const subjectShort = (() => {
    if (subjectText.length <= 190) return subjectText;
    const cut = subjectText.slice(0, 190);
    const stop = cut.lastIndexOf('. ');
    return stop > 60 ? cut.slice(0, stop + 1) : `${cut.slice(0, 187).trimEnd()}\u2026`;
  })();
  const masthead = `<div class="masthead">${logo}<p class="mast-eyebrow">${L.eyebrowAudit}</p><h1 class="mast-title">${L.coverTitle.replace(/<br>/g, ' ')}</h1><p class="mast-sub">${subjectShort}</p><dl class="mast-meta"><div><dt>${L.auditSubject}</dt><dd>${t(a.client.name)}</dd></div><div><dt>${L.reportDate}</dt><dd>${esc(a.client.reportDate)}</dd></div><div><dt>${L.auditType}</dt><dd>${esc(a.meta.auditType)}</dd></div><div><dt>${L.preparedBy}</dt><dd>${esc(preparedBy)}</dd></div></dl></div>`;
  /*
   * Сводка занимает ДВА листа намеренно, а не один с переливом.
   *
   * Раньше всё лежало на одной странице, не влезало, и хвост уезжал на свой лист: три строчки
   * приоритетов и восемьдесят процентов белого. Таких листов в отчёте было три из двенадцати, и
   * выглядело это как недоделанная работа. Теперь первый лист про балл и из чего он сложился,
   * второй про проверки самого отчёта и что делать. Оба полные.
   */
  pages.push(`<div class="page">${masthead}<div class="eyebrow">${L.summaryEyebrow}</div><h2>${L.secSummary}</h2><p class="lead">${t(a.summary.lead)}</p>${overallBlock}${footer(a, n++, preparedBy)}</div>`);
  pages.push(`<div class="page">${header(a, L.secSummary, L)}<div class="eyebrow">${L.summaryEyebrow}</div><h2>${L.secondMeasure}</h2><div class="scorecard">${scoreCards}</div><p class="scorecard-foot">${L.scorecardFoot}</p><div class="verdict"><p><strong>${L.keyTakeaway}</strong> ${t(a.summary.verdict)}</p></div><h3>${L.threePriorities}</h3>${olist(a.summary.priorities)}${footer(a, n++, preparedBy)}</div>`);
  /*
   * Обзор: таблица прочитанных страниц не влезала на лист и переливалась. Режем её по счёту
   * строк, как техническую. Первый лист несёт параметры сайта и первые строки, дальше только
   * продолжение таблицы со своей шапкой.
   */
  /*
   * Список прочитанных страниц. На двадцати строках это два листа, на ста это семь листов
   * подряд одной таблицей посреди разбора. Поэтому в основной части печатаются первые строки,
   * а весь список уезжает приложением в конец: покупатель за сто страниц имеет право видеть все
   * сто адресов, но не вместо чтения.
   */
  const readStat = a.reading && typeof a.reading.read === 'number' ? a.reading : null;
  const readNote = readStat && L.readNote ? `<p class="scorecard-foot">${esc(L.readNote(readStat.read, readStat.wanted))}</p>` : '';
  const allSampleRows = (a.sample || []).filter((x) => x.title !== undefined);
  const APPENDIX_FROM = 20;
  /*
   * В приложении заголовок обрезается: длинный переносится на вторую строку, и лист, рассчитанный
   * по числу строк, переливается. Замерено: на восьмидесяти страницах так переливали три листа.
   * Это справочник прочитанного, ключ в нём адрес, а не заголовок.
   */
  const appendixRow = (x) => {
    const title = String(x.title || '');
    const short = title.length > 52 ? `${title.slice(0, 50).trimEnd()}\u2026` : title;
    return `<tr><td><code>${esc(new URL(x.url).pathname)}</code></td><td>${esc(short)}</td><td>${x.words}</td><td>${x.h2Count ?? '\u00b7'}</td><td>${x.tables ?? '\u00b7'}</td><td>${x.linkCount ?? '\u00b7'}</td><td>${x.images ? `${x.images - x.imagesNoAlt}/${x.images}` : '\u00b7'}</td></tr>`;
  };

  const asAppendix = allSampleRows.length > APPENDIX_FROM;
  const sampleRows = asAppendix ? allSampleRows.slice(0, 7) : allSampleRows;
  const pagesHead = `<tr><th>${L.colUrl}</th><th>${L.colTitle}</th><th>${L.colWords}</th><th>H2</th><th>${L.colTables || 'Tables'}</th><th>${L.colLinks || 'Links'}</th><th>Alt</th></tr>`;
  const pageRow = (x) => `<tr><td><code>${esc(new URL(x.url).pathname)}</code></td><td>${esc(x.title)}</td><td>${x.words}</td><td>${x.h2Count ?? '\u00b7'}</td><td>${x.tables ?? '\u00b7'}</td><td>${x.linkCount ?? '\u00b7'}</td><td>${x.images ? `${x.images - x.imagesNoAlt}/${x.images}` : '\u00b7'}</td></tr>`;
  const FIRST_PAGE_ROWS = 7;
  const NEXT_PAGE_ROWS = 16;
  const firstRows = sampleRows.slice(0, FIRST_PAGE_ROWS);
  const restRows = sampleRows.slice(FIRST_PAGE_ROWS);
  pages.push(`<div class="page">${header(a, L.secOverview, L)}<div class="eyebrow">${L.overviewEyebrow}</div><h2>${L.whatSiteIs}</h2><table><tr><th>${L.parameter}</th><th>${L.value}</th></tr>${(a.overview.rows || []).map(([k, v]) => `<tr><td>${t(k)}</td><td>${t(v)}</td></tr>`).join('')}</table><p>${t(a.overview.note)}</p><h3>${L.pagesSampled}</h3>${readNote}<table class="pages">${pagesHead}${firstRows.map(pageRow).join('')}</table>${asAppendix ? `<p class="scorecard-foot">${esc(L.fullListInAppendix || '')}</p>` : ''}${footer(a, n++, preparedBy)}</div>`);
  for (let i = 0; i < restRows.length; i += NEXT_PAGE_ROWS) {
    const chunk = restRows.slice(i, i + NEXT_PAGE_ROWS);
    pages.push(`<div class="page">${header(a, L.secOverview, L)}<div class="eyebrow">${L.overviewEyebrow}</div><h2>${L.pagesSampled}</h2><table class="pages">${pagesHead}${chunk.map(pageRow).join('')}</table>${footer(a, n++, preparedBy)}</div>`);
  }
  const cardBody = (c) => [
    c.text ? `<p>${t(c.text)}</p>` : '',
    c.cost ? `<p><span class="card-tag">${L.whatItCosts}</span>${t(c.cost)}</p>` : '',
    c.fix ? `<p><span class="card-tag">${L.theFix}</span>${t(c.fix)}</p>` : '',
  ].join('') || '<p class="card-empty">${L.noBody}</p>';
  const cards = (a.critical || []).map((c, i) => `<div class="card ${c.level === 'warn' ? 'warn' : ''}"><h4>${i + 1}. ${t(c.title)}</h4>${cardBody(c)}</div>`).join('') || `<p>${L.noCritical}</p>`;
  /*
   * Лист «что чинить первым» печатается, только когда есть что чинить. Раньше на чистом сайте
   * он занимал целую страницу одной строкой «критичных дефектов не найдено», а это в отчёте за
   * деньги выглядит как пустой лист. Сам факт не пропадает: он сказан в сводке.
   */
  if ((a.critical || []).length) {
    pages.push(`<div class="page">${header(a, L.secCritical, L)}<div class="eyebrow">${L.criticalEyebrow}</div><h2>${L.criticalTitle}</h2><div class="cards">${cards}</div>${footer(a, n++, preparedBy)}</div>`);
  }
  /*
   * Длинная таблица режется на листы по счёту строк, а не переливается сама.
   *
   * Перелив оставлял лист с четырьмя строками и восемьюдесятью процентами белого: в отчёте за
   * деньги это читается как недоделанная работа. Порог взят по факту: строка занимает примерно
   * 11 мм, на лист влезает около восемнадцати вместе с заголовком. Строка с пояснением выше,
   * поэтому считаем её за полторы.
   */
  const techChecks = [...checksBy('technical'), ...checksBy('onpage')];
  const techHead = `<tr><th>${L.colCheck}</th><th>${L.colStatus}</th><th>${L.colFinding}</th></tr>`;
  const rowHtml = (c) => `<tr><td>${esc(c.label)}</td>${statusCell(c.status, L)}<td>${esc(c.value)}${c.comment ? `<br><span style="color:var(--muted)">${esc(c.comment)}</span>` : ''}</td></tr>`;
  const TECH_UNITS_PER_PAGE = 17;
  const techPages = [];
  let bucket = [];
  let units = 0;
  for (const c of techChecks) {
    const cost = c.comment ? 1.5 : 1;
    if (units + cost > TECH_UNITS_PER_PAGE && bucket.length) { techPages.push(bucket); bucket = []; units = 0; }
    bucket.push(c); units += cost;
  }
  if (bucket.length) techPages.push(bucket);
  techPages.forEach((chunk, i) => {
    const title = techPages.length > 1 ? `${L.technicalTitle} (${i + 1}/${techPages.length})` : L.technicalTitle;
    pages.push(`<div class="page">${header(a, L.secTechnical, L)}<div class="eyebrow">${L.technicalEyebrow}</div><h2>${esc(title)}</h2><table>${techHead}${chunk.map(rowHtml).join('')}</table>${footer(a, n++, preparedBy)}</div>`);
  });
  pages.push(`<div class="page">${header(a, L.secContent, L)}<div class="eyebrow">${L.contentEyebrow}</div><h2>${L.contentTitle}</h2><div class="two-col"><div><h3>${L.strengths}</h3>${list(a.content.strengths)}</div><div><h3>${L.weaknesses}</h3>${list(a.content.weaknesses)}</div></div><h3>${L.gaps}</h3>${list(a.content.gaps)}${checksBy('content').length ? `<table><tr><th>${L.colCheck}</th><th>${L.colStatus}</th><th>${L.colFinding}</th></tr>${checksBy('content').map((c) => `<tr><td>${esc(c.label)}</td>${statusCell(c.status, L)}<td>${esc(c.value)}</td></tr>`).join('')}</table>` : ''}${footer(a, n++, preparedBy)}</div>`);
  const geoRows = [...checksBy('aeo'), ...checksBy('geo')].map((c) => `<tr><td>${esc(c.label)}</td>${statusCell(c.status, L)}<td>${esc(c.value)}${c.comment ? `. ${esc(c.comment.charAt(0).toUpperCase() + c.comment.slice(1))}` : ''}</td></tr>`).join('') + (a.geo.rows || []).map(([k, s, d]) => `<tr><td>${t(k)}</td><td>${t(s)}</td><td>${t(d)}</td></tr>`).join('');
  const sources = [...(a.sources || []), ...(a.demand && Array.isArray(a.demand.queries) ? [demandSourceRow(a.demand, a.meta?.lang === 'ru' ? 'ru' : 'en')] : [])];
  const checkTable = (g) => (checksBy(g).length ? `<table><tr><th>${L.colCheck}</th><th>${L.colStatus}</th><th>${L.colFinding}</th></tr>${checksBy(g).map((c) => `<tr><td>${esc(c.label)}</td>${statusCell(c.status, L)}<td>${esc(c.value)}${c.comment ? `<br><span style="color:var(--muted)">${esc(c.comment)}</span>` : ''}</td></tr>`).join('')}</table>` : '');
  /*
   * AEO и GEO стояли на одном листе: два заголовка, два списка, две врезки и таблица сигналов.
   * Лист переливал почти на восемьсот пикселей. Теперь по разделу на лист.
   */
  pages.push(`<div class="page">${header(a, L.secAeo, L)}<div class="eyebrow">${L.aeoEyebrow}</div><h2>${L.aeoTitle}</h2><p class="lead">${esc(L.aeoLead)}</p><div class="two-col"><div><h3>${L.aeoWorks}</h3>${list(a.aeo.works)}</div><div><h3>${L.aeoBlocks}</h3>${list(a.aeo.blocks)}</div></div><div class="callout"><p><strong>${L.recommendation}</strong> ${t(a.aeo.recommendation)}</p></div>${footer(a, n++, preparedBy)}</div>`);
  /*
   * Таблица сигналов GEO выросла до двадцати пяти строк и на лист не влезает. Режем её, как и
   * остальные длинные таблицы: по счёту строк, с продолжением под своим номером.
   */
  const geoRowList = [...checksBy('geo'), ...checksBy('overview')].map((c) => `<tr><td>${esc(c.label)}</td>${statusCell(c.status, L)}<td>${esc(c.value)}${c.comment ? `<br><span style="color:var(--muted)">${esc(c.comment)}</span>` : ''}</td></tr>`);
  const geoHead = `<tr><th>${L.colSignal}</th><th>${L.colStatus}</th><th>${L.colDetail}</th></tr>`;
  const GEO_ROWS_PER_PAGE = 15;
  const geoChunks = [];
  for (let i = 0; i < geoRowList.length; i += GEO_ROWS_PER_PAGE) geoChunks.push(geoRowList.slice(i, i + GEO_ROWS_PER_PAGE));
  (geoChunks.length ? geoChunks : [[]]).forEach((chunk, i, all) => {
    const title = all.length > 1 ? `${L.geoTitle} (${i + 1}/${all.length})` : L.geoTitle;
    const tail = i === all.length - 1 ? `<div class="callout"><p>${t(a.geo.callout)}</p></div>` : '';
    pages.push(`<div class="page">${header(a, L.secAeo, L)}<div class="eyebrow">${L.aeoEyebrow}</div><h2>${esc(title)}</h2><table>${geoHead}${chunk.join('')}</table>${tail}${footer(a, n++, preparedBy)}</div>`);
  });
  pages.push(`<div class="page">${header(a, L.secOffpage, L)}<div class="eyebrow">${L.offpageEyebrow}</div><h2>${L.offpageTitle}</h2>${checkTable('offpage')}${list(a.offpage.listed)}<p>${t(a.offpage.note)}</p>${footer(a, n++, preparedBy)}</div>`);
  pages.push(`<div class="page">${header(a, L.secOffpage, L)}<div class="eyebrow">${L.conversionEyebrow}</div><h2>${L.conversionTitle}</h2>${checkTable('conversion')}<table><tr><th>${L.colElement}</th><th>${L.colStatus}</th></tr>${(a.conversion.rows || []).map(([k, v]) => `<tr><td>${t(k)}</td><td>${t(v)}</td></tr>`).join('')}</table>${footer(a, n++, preparedBy)}</div>`);

  /*
   * Вы и ваши конкуренты. Балл видимости стоит первым, потому что он у всех посчитан по десяти
   * страницам и сравним напрямую. Шесть оценок аудита идут ниже с подписью, что свой сайт читался
   * глубже: без этой подписи «2 из 100» рядом с «1 из 10» читается как сравнение, которым не
   * является. Сайт, который не ответил, получает прочерк, а не выдуманный ноль.
   */
  const rivals = Array.isArray(a.rivals) ? a.rivals.slice(0, 5) : [];
  if (rivals.length) {
    const mine = { host: a.meta.host, score: a.overall?.score ?? null, grade: a.overall?.grade ?? null, areas: a.overall?.areas || [], seo: a.overall?.seo?.score ?? null, reportScores: a.scores || {}, pagesRead: a.reading?.read ?? null };
    const all = [mine, ...rivals];
    const cell = (v, max) => (v === null || v === undefined ? `<span class="na">\u00b7</span>` : max ? `${v}<span>/${max}</span>` : String(v));
    const best = (vals) => { const nums = vals.filter((x) => typeof x === 'number'); return nums.length ? Math.max(...nums) : null; };
    const hostLabel = (h) => esc(String(h || '')).replace(/\.(?=[^.]+$)/, '<wbr>.');
    const headRow = `<tr><th>${esc(L.colSignal || 'Signal')}</th>${all.map((x, i) => `<th class="n${i === 0 ? ' mine' : ''}">${hostLabel(x.host)}</th>`).join('')}</tr>`;
    const scoreVals = all.map((x) => x.score);
    const topScore = best(scoreVals);
    /*
     * Крупный сайт часто пускает робота только на главную. Балл, посчитанный по одной странице,
     * это не то же самое, что балл по десяти, поэтому такой столбец помечается звёздочкой, а
     * строка «сколько страниц дал прочитать» стоит сразу под баллом, где её видно вместе с ним.
     */
    const THIN = 3;
    const thin = (x) => typeof x.pagesRead === 'number' && x.pagesRead > 0 && x.pagesRead < THIN;
    const anyThin = rivals.some(thin);
    const refused = rivals.filter((x) => x.reachable === false);
    const withheld = rivals.filter((x) => x.reachable !== false && x.score === null);
    const rows = [
      `<tr class="lead-row"><td>${esc(L.aiVisibility || 'AI visibility')}</td>${all.map((x) => `<td class="n${x.score !== null && x.score === topScore ? ' beat' : ''}">${cell(x.score, 100)}${thin(x) ? '*' : ''}</td>`).join('')}</tr>`,
      `<tr class="foot-row"><td>${esc(L.pagesReadLabel || 'Pages read')}</td>${all.map((x) => `<td class="n">${x.pagesRead ?? '\u00b7'}</td>`).join('')}</tr>`,
      `<tr><td>${esc(L.seoBasics || 'SEO basics')}</td>${all.map((x) => `<td class="n">${cell(x.seo, 100)}</td>`).join('')}</tr>`,
      ...(mine.areas || []).map((area, k) => {
        const vals = all.map((x) => (x.areas && x.areas[k] ? x.areas[k].score : null));
        const top = best(vals);
        return `<tr><td>${esc(area.label)}</td>${vals.map((v) => `<td class="n${v !== null && v === top ? ' beat' : ''}">${cell(v, area.max)}</td>`).join('')}</tr>`;
      }),
    ].join('');
    pages.push(`<div class="page">${header(a, L.secRivals || 'Rivals', L)}<div class="eyebrow">${esc(L.rivalsEyebrow || 'Rivals')}</div><h2>${esc(L.rivalsTitle || 'You and your rivals')}</h2><p class="lead">${esc(L.rivalsLead || '')}</p><table class="rivals-table">${headRow}${rows}</table><p class="scorecard-foot">${refused.length ? esc(L.rivalsFoot || '') : ''}${anyThin ? `${refused.length ? ' ' : ''}${esc(L.rivalsThin || '')}` : ''}${refused.length ? ` ${esc(L.rivalsRefused ? L.rivalsRefused(refused.map((x) => `${x.host}${x.status ? ` (${x.status})` : ''}`)) : '')}` : ''}${withheld.length ? ` ${esc(L.rivalsWithheld ? L.rivalsWithheld(withheld.map((x) => x.host)) : '')}` : ''}</p>${footer(a, n++, preparedBy)}</div>`);
  }

  /*
   * «Что вставить»: готовые файлы прямо в отчёте. Покупатель за 149 получает не список
   * пожеланий, а карту для агентов, разметку организации и починенные заголовки, которые можно
   * скопировать отсюда или взять файлами из письма.
   *
   * Пропуски в разметке названы отдельно и намеренно: поле, которого нет в данных, мы не
   * придумываем, а говорим, что туда вписать.
   */
  /*
   * Готовые файлы входят только в аудит за 149. На ступенях дешевле они не печатаются: иначе
   * то, чем дорогой товар отличается от дешёвого, уезжает в дешёвый бесплатно.
   */
  if (a.meta?.tier === 'audit') {
    const hl = a.meta?.lang === 'ru' ? 'ru' : 'en';
    const llms = buildLlmsTxt(a, { lang: hl });
    const org = buildOrganisationSchema(a, { lang: hl });
    const allFixes = fixTitlesAndDescriptions(a, { lang: hl, limit: 40 });
    const metaFixes = allFixes.slice(0, 6);
    const llmsShort = llms.split('\n').slice(0, 16).join('\n');
    const cut = llms.split('\n').length > 16;
    pages.push(`<div class="page handover-page">${header(a, L.secHandover || 'Files', L)}<div class="eyebrow">${esc(L.handoverEyebrow || 'Files')}</div><h2>${esc(L.handoverTitle || 'What to paste')}</h2><p class="lead">${esc(L.handoverLead || '')}</p>
      <h3>${esc(L.llmsHead || 'llms.txt')}</h3><p class="hand-note">${esc(L.llmsNote || '')}</p><pre class="code">${esc(llmsShort)}${cut ? `\n${esc(L.andMoreInFile || '')}` : ''}</pre>
      ${footer(a, n++, preparedBy)}</div>`);
    pages.push(`<div class="page handover-page">${header(a, L.secHandover || 'Files', L)}<div class="eyebrow">${esc(L.handoverEyebrow || 'Files')}</div><h2>${esc(L.orgHead || 'Organization markup')}</h2><p class="hand-note">${esc(L.orgNote || '')}</p><pre class="code">${esc(org.text)}</pre>
      ${org.missing.length ? `<h3>${esc(L.orgMissingHead || 'Fill in yourself')}</h3><p class="hand-note">${esc(L.orgMissingNote || '')}</p><ul class="hand-missing">${org.missing.map((m) => `<li><code>${esc(m.field)}</code> ${esc(m.what)}</li>`).join('')}</ul>` : ''}
      ${footer(a, n++, preparedBy)}</div>`);
    if (metaFixes.length) {
      /*
       * Три строки на лист, а не шесть. Замерено на отрисованном листе: самая высокая строка
       * это 250 пикселей (два блока по четыре строки, каждая длинная часть в две строки), от
       * листа под таблицу остаётся около 790. Длина того, что стоит сейчас, ограничена здесь же,
       * иначе одна страница с описанием в триста знаков ломает расчёт.
       */
      const METAFIX_ROWS = 3;
      const short = (x) => { const t = String(x || ''); return t.length > 150 ? `${t.slice(0, 148).trimEnd()}\u2026` : t; };
      const rowOf = (f) => `<tr><td><code>${esc(f.path)}</code></td><td>${[
        f.title ? `<b>title</b><br><span class="was">${esc(short(f.title.now) || '—')}</span><br><span class="why">${esc(f.title.problem)}</span><br><span class="now">${esc(f.title.suggestion)}</span>` : '',
        f.description ? `<b>description</b><br><span class="was">${esc(short(f.description.now) || '—')}</span><br><span class="why">${esc(f.description.problem)}</span><br><span class="now">${esc(f.description.suggestion)}</span>` : '',
      ].filter(Boolean).join('<br><br>')}</td></tr>`;
      const parts = Math.ceil(metaFixes.length / METAFIX_ROWS);
      for (let i = 0; i < metaFixes.length; i += METAFIX_ROWS) {
        const chunk = metaFixes.slice(i, i + METAFIX_ROWS);
        const part = Math.floor(i / METAFIX_ROWS) + 1;
        const title = parts > 1 ? `${L.metaHead || 'Titles and descriptions'} (${part}/${parts})` : (L.metaHead || 'Titles and descriptions');
        const last = part === parts;
        pages.push(`<div class="page handover-page">${header(a, L.secHandover || 'Files', L)}<div class="eyebrow">${esc(L.handoverEyebrow || 'Files')}</div><h2>${esc(title)}</h2><p class="hand-note">${esc(L.metaNote || '')}</p><table class="meta-fixes"><tr><th>${esc(L.colUrl)}</th><th>${esc(L.colFinding)}</th></tr>${chunk.map(rowOf).join('')}</table>${last && allFixes.length > metaFixes.length ? `<p class="scorecard-foot">${esc(L.metaMore ? L.metaMore(allFixes.length - metaFixes.length) : '')}</p>` : ''}${footer(a, n++, preparedBy)}</div>`);
      }
    }
  }

  const phases = (a.roadmap || []).map((x) => `<div class="phase"><div class="phase-head"><span class="badge">${esc(x.badge)}</span><span class="phase-title">${t(x.title)}</span></div>${olist(x.items)}</div>`).join('');
  /*
   * Последний лист несёт и дорожную карту, и источники с границами замера. Оба раздела короткие,
   * по отдельности каждый занимал меньше половины листа, и владелец просил ровно двенадцать.
   * Проверено замером: вместе влезают без перелива.
   */
  pages.push(`<div class="page">${header(a, L.secRoadmap, L)}<div class="eyebrow">${L.roadmapEyebrow}</div><h2>${L.roadmapTitle}</h2>${phases}<div class="verdict"><p><strong>${L.keyMessage}</strong> ${t(a.closing)}</p></div><div class="eyebrow" style="margin-top:7mm">${L.limitationsEyebrow}</div><h2>${L.sourcesTitle}</h2>${sources.length ? `<table><tr><th>${L.colSource}</th><th>${L.colAccess}</th><th>${L.colWhatRead}</th></tr>${sources.map((x) => `<tr><td>${t(x.name)}</td><td>${t(x.access)}</td><td>${t(x.detail)}</td></tr>`).join('')}</table><p class="scorecard-foot">${L.sourcesFoot}</p>` : ''}<h3>${L.limitations}</h3>${list(a.limitations)}<p class="tool-line">${esc(brand && brand.showToolLine === false ? L.reproducible : L.collectedBy(a.meta.tool, (a.meta.collectedAt || '').slice(0, 10)))}</p>${footer(a, n++, preparedBy)}</div>`);
  // Карта спроса идёт приложением после дорожной карты: она не входит в баллы, и об этом
  // сказано в ней самой и в таблице источников выше.
  /* Приложение со всеми прочитанными страницами: только когда их больше двадцати. */
  if (asAppendix) {
    /*
     * Четырнадцать строк, а не на глаз. Замерено на отрисованном листе: строка таблицы это
     * 54 пикселя, от верха листа до таблицы уходит 189, снизу отступ и подвал ещё 106.
     * Остаётся около 790 пикселей, это четырнадцать строк вместе с шапкой таблицы.
     */
    const APPENDIX_ROWS = 14;
    for (let i = 0; i < allSampleRows.length; i += APPENDIX_ROWS) {
      const chunk = allSampleRows.slice(i, i + APPENDIX_ROWS);
      const part = Math.floor(i / APPENDIX_ROWS) + 1;
      const parts = Math.ceil(allSampleRows.length / APPENDIX_ROWS);
      const title = parts > 1 ? `${L.appendixPages || L.pagesSampled} (${part}/${parts})` : (L.appendixPages || L.pagesSampled);
      pages.push(`<div class="page">${header(a, L.secOverview, L)}<div class="eyebrow">${esc(L.appendixEyebrow || 'Appendix')}</div><h2>${esc(title)}</h2><table class="pages appendix">${pagesHead}${chunk.map(appendixRow).join('')}</table>${footer(a, n++, preparedBy)}</div>`);
    }
  }

  if (a.demand && Array.isArray(a.demand.queries)) {
    pages.push(`<div class="page">${header(a, L.secDemand, L)}<div class="eyebrow">${L.demandEyebrow}</div><h2>${L.demandTitle}</h2>${renderDemandHtml(a.demand, { lang: a.meta?.lang === 'ru' ? 'ru' : 'en' })}${footer(a, n++, preparedBy)}</div>`);
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(a.client.name)}: SEO, AEO and GEO audit</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono&display=swap"><style>${css()}${accentCss}</style></head><body>${pages.join('\n')}</body></html>`;
}

function findChrome() {
  const candidates = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean);
  return candidates.find((p) => existsSync(p));
}

export async function render(audit, { out, pdf = false, brand = null } = {}) {
  const html = toHtml(audit, brand);
  writeFileSync(out, html);
  let pdfPath = null;
  if (pdf) {
    const chrome = findChrome();
    if (!chrome) { console.error('no Chrome found; set CHROME_PATH or open the HTML and print to PDF'); }
    else {
      pdfPath = out.replace(/\.html?$/, '') + '.pdf';
      const profile = mkdtempSync(join(tmpdir(), 'operstack-audit-'));
      const r = spawnSync(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, '--virtual-time-budget=8000', '--no-pdf-header-footer', `--print-to-pdf=${pdfPath}`, `file://${out}`], { encoding: 'utf8', timeout: 90000 });
      rmSync(profile, { recursive: true, force: true });
      if (!existsSync(pdfPath)) { console.error(`Chrome did not write the PDF${r.stderr ? `: ${r.stderr.slice(-300)}` : ''}`); pdfPath = null; }
    }
  }
  return { html, pdf: pdfPath };
}
