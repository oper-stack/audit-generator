#!/usr/bin/env node
/** Агентная поверхность: три проверки, их перевод, работа и задание для агента. */
import { FIX_ACTIONS } from './fix.mjs';
import { localiseChecks } from './i18n.mjs';
import { agentPrompt } from './prompts.mjs';
import { draftNarrative } from './narrative.mjs';

let bad = 0;
const is = (n, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { bad++; console.error(`FAIL ${n}\n  ждали ${JSON.stringify(b)}\n  вышло ${JSON.stringify(a)}`); } else console.log(`ok   ${n}`); };
const ok = (n, c) => is(n, Boolean(c), true);

const ids = ['agent-card', 'api-catalog', 'agent-markdown'];

// У каждой проверки есть решение и перевод
for (const id of ids) ok(`у проверки ${id} описано, что делать или почему не делаем`, Boolean(FIX_ACTIONS[id] && (FIX_ACTIONS[id].action || FIX_ACTIONS[id].why)));
const ru = localiseChecks(ids.map((id) => ({ id, group: 'geo', label: 'English label', status: 'warn', value: 'not present', comment: 'an early, optional standard: it is the file agent directories read to learn who you are and what you offer' })), 'ru');
for (const r of ru) ok(`проверка ${r.id} переведена`, !/English label/.test(r.label) && !/not present/.test(r.value));

// Каталог API мы не обещаем чинить: он нужен не всем
is('каталог API не обещаем', FIX_ACTIONS['api-catalog'].scope, 'never');
ok('и объяснено почему', /есть API/.test(FIX_ACTIONS['api-catalog'].why.ru));

// Задания для агента полные и не врут про обязательность
const card = agentPrompt({ id: 'agent-card', label: 'Карточка агента', status: 'warn', value: 'нет' }, { lang: 'ru' });
ok('в задании про карточку есть проверка', /Как проверить/.test(card));
ok('и запрет выдумывать возможности', /только правду|выдуманная возможность/.test(card));
const md = agentPrompt({ id: 'agent-markdown', label: 'Markdown-версия', status: 'warn', value: 'нет' }, { lang: 'ru' });
ok('в задании про markdown сказано, что класть, а что нет', /меню и подвал/.test(md));

// В отчёте это не превращается в приговор: стандарт ранний
const audit = {
  meta: { host: 'x.ru', lang: 'ru' },
  scores: { 'GEO, visibility in AI systems': 7 },
  client: { name: '{{a}}', subject: '{{b}}' },
  summary: { lead: '{{a}}', verdict: '{{b}}', priorities: ['{{1}}'] },
  overview: { rows: [], note: '{{n}}' }, content: { strengths: [], weaknesses: [], gaps: [] },
  aeo: { works: [], blocks: [], recommendation: '{{r}}' }, geo: { rows: [], callout: '{{c}}' },
  offpage: { listed: [], note: '{{n}}' }, conversion: { rows: [] }, roadmap: [], closing: '{{c}}',
  sample: [], checks: [{ id: 'agent-card', group: 'geo', label: 'Карточка агента', status: 'warn', value: 'нет' }],
};
const d = draftNarrative(audit, { lang: 'ru' });
ok('в приоритетах появляется работа по карточке', /agent\.json|карточк/i.test(JSON.stringify(d.summary.priorities)));
ok('и вывод не называет это провалом', !/критичн/i.test(d.summary.verdict) || /нет/.test(d.summary.verdict));

if (bad) { console.error(`\n${bad} тест(ов) упало`); process.exit(1); }
console.log('\nвсе тесты агентной поверхности прошли');
