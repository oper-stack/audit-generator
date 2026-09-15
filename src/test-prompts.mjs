#!/usr/bin/env node
/** Задания для ИИ-агента: полнота, язык, запрет на выдумки. */
import { readFileSync } from 'node:fs';
import { agentPrompt, agentPrompts, renderAgentPrompts, firstFixParts, FIRST_FIX_IDS } from './prompts.mjs';
import { FIX_ACTIONS } from './fix.mjs';

let bad = 0;
const is = (n, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { bad++; console.error(`FAIL ${n}\n  ждали ${JSON.stringify(b)}\n  вышло ${JSON.stringify(a)}`); } else console.log(`ok   ${n}`); };
const ok = (n, c) => is(n, Boolean(c), true);

const c = (id, status, label, value) => ({ id, status, label, value, group: 'technical' });
const audit = (checks, lang = 'en') => ({ meta: { host: 'x.ru', lang }, checks });

const one = agentPrompt(c('alt', 'bad', 'Подписи к картинкам', '3 из 10 картинок с подписью'), { lang: 'ru' });
ok('в задании есть точка отсчёта', one.includes('**Сейчас:** 3 из 10'));
ok('в задании есть само действие', one.includes('**Задача:**'));
ok('в задании есть признак готовности', one.includes('**Как проверить:**'));
ok('в задании есть запрет выдумывать', one.includes('не выдумывай факты о бизнесе'));

// Даже там, где своего текста нет, все три части на месте
const generic = agentPrompt(c('xmlrpc', 'warn', 'xmlrpc.php', 'открыт'), { lang: 'ru' });
ok('общее задание тоже с проверкой', generic.includes('**Как проверить:**'));
ok('и с действием из набора работ', generic.includes('Закрыть открытую точку'));

// Порядок: сначала провалы, потом предупреждения
const list = agentPrompts(audit([c('og', 'warn', 'OG', 'нет'), c('robots', 'bad', 'robots', 'закрыт')]), { lang: 'ru' });
is('первым идёт провал, а не предупреждение', list[0].id, 'robots');
is('заданий столько же, сколько открытых проверок', list.length, 2);
is('пройденные проверки заданий не порождают', agentPrompts(audit([c('og', 'ok', 'OG', 'есть')])).length, 0);
is('лимит режет список', agentPrompts(audit([c('og', 'warn', 'OG', 'нет'), c('robots', 'bad', 'r', 'з')]), { limit: 1 }).length, 1);

// Язык: русский файл по английскому аудиту не должен содержать английских проверок
const ruFile = renderAgentPrompts(audit([c('alt', 'bad', 'Image alt text', '3 of 10 images carry alt text (30%) across 5 sampled page(s)')], 'en'), { lang: 'ru' });
ok('название проверки переведено', ruFile.includes('Подписи к картинкам'));
ok('и значение тоже', !ruFile.includes('images carry alt text'));
const enFile = renderAgentPrompts(audit([c('alt', 'bad', 'Image alt text', '3 of 10 images')], 'en'), { lang: 'en' });
ok('английский файл без кириллицы', !/[А-Яа-яЁё]/.test(enFile));

// Задания не обещают того, чего мы не знаем
const contact = agentPrompt(c('conv-messenger', 'bad', 'Мессенджер', 'нет'), { lang: 'ru' });
ok('не выбирает мессенджер за клиента', /не знаешь, какой мессенджер|спроси владельца/.test(contact));
const src = agentPrompt(c('sources', 'bad', 'Источники', '2 из 20'), { lang: 'ru' });
ok('запрещает ставить ссылку наугад', /не ставь ссылку наугад|неверный источник хуже/.test(src));
const af = agentPrompt(c('answer-first', 'bad', 'Ответ в начале', '2 из 20'), { lang: 'ru' });
ok('запрещает придумывать цифру', /не придумывай её|спроси владельца/.test(af));

// Покрытие: у каждой проверки, которую мы беремся чинить, задание осмысленное
const mechanical = Object.entries(FIX_ACTIONS).filter(([, r]) => r.scope === 'always' || r.scope === 'files');
const empty = mechanical.filter(([id]) => {
  const p = agentPrompt(c(id, 'bad', id, 'значение'), { lang: 'ru' });
  return !p.includes('**Задача:**') || p.split('**Задача:**')[1].trim().length < 20;
}).map(([id]) => id);
is('у каждой чинимой проверки есть внятное задание', empty, []);

// Ноль, который означает отсутствие, пишется словами, а не цифрой. 14.09.2026 в доставленном
// письме стояло «Сейчас: 0 знаков», и человек не понимал, что описания у страницы просто нет.
const zeros = [
  ['description', 'no meta description on the page', /описания у страницы нет/],
  ['title', 'no title on the page', /заголовка у страницы нет/],
  ['h1', 'no H1 on the page', /заголовка H1 на странице нет/],
  // У robots ноль правил это настоящее измерение, а не отсутствие: словами пишется только
  // пропавшая строка Sitemap, поэтому в образце правил три.
  ['robots', '3 disallow rule(s) in 2 agent block(s), no sitemap line', /строки с картой сайта нет/],
];
const nowLine = (text) => (text.split('\n').find((l) => l.startsWith('**Сейчас:**')) || '');
for (const [id, value, expect] of zeros) {
  const localised = renderAgentPrompts(audit([c(id, 'bad', id, value)], 'en'), { lang: 'ru' });
  const now = nowLine(localised);
  ok(`${id}: по-английски ноль не выводится цифрой`, !/(^|\s)0 (chars|H1|sitemap)/.test(value));
  ok(`${id}: по-русски отсутствие названо словами`, expect.test(now));
  // Проверяем именно строку «Сейчас»: в тексте задачи числа законны («в 120-160 знаков»).
  ok(`${id}: в строке «Сейчас» нет обрывка с нулём`, !/(^|\s)0\s/.test(now));
}

// Шапка файла объясняет, как этим пользоваться
const head = renderAgentPrompts(audit([c('robots', 'bad', 'robots', 'закрыт')]), { lang: 'ru' });
// Проверяем смысл, а не точную формулировку: шапку переписывали под покупателя без терминала.
ok('шапка объясняет, что копировать задачу целиком', /задачу целиком/i.test(head) && /Сейчас/.test(head) && /Как проверить/.test(head));
ok('и предупреждает делать по одной', /по одной за раз/i.test(head));
ok('и обещает, что код знать не нужно', /кода знать не нужно/i.test(head));
ok('в файле нет пустых сдвоенных строк', !/\n\n\n/.test(head));

// ---- первая правка на бесплатной странице тремя частями.
// Список id берётся из исходника бесплатной проверки, а не из головы: новая находка без
// сопоставления уронит этот тест, а не оставит покупателя без задачи молча.
{
  const src = readFileSync(new URL('./visibility.mjs', import.meta.url), 'utf8');
  const ids = [...new Set([...src.matchAll(/id: '([a-z0-9-]+)', level: (?!'na')/g)].map((m) => m[1]))];
  ok(`находок бесплатной проверки в исходнике больше десяти (${ids.length})`, ids.length > 10);
  const missing = [];
  for (const id of ids) for (const lang of ['ru', 'en']) {
    const p = firstFixParts({ id, area: 'x', text: 'что-то измерено' }, { lang });
    if (!p || !p.now || p.task.length < 30 || p.verify.length < 20 || /null|undefined/.test(JSON.stringify(p))) missing.push(`${id}/${lang}`);
    else if (lang === 'en' && /[А-Яа-яЁё]/.test(p.task + p.verify + p.rule + Object.values(p.labels).join(''))) missing.push(`${id}/en: кириллица`);
  }
  is('у каждой находки бесплатной проверки есть три части на обоих языках', missing, []);
  is('и в списке экспорта нет лишних id, которых проверка не выдаёт', FIRST_FIX_IDS.filter((id) => !ids.includes(id)), []);
  is('неизвестная находка даёт null, а не чужое указание', firstFixParts({ id: 'что-то-новое', text: 'x' }, { lang: 'ru' }), null);
  is('находка без текста даёт null', firstFixParts({ id: 'llms-missing', text: '' }, { lang: 'ru' }), null);
  is('пустой вход даёт null', firstFixParts(null), null);
  const p = firstFixParts({ id: 'robots-fetchers-blocked', area: 'Пускает ли роботов ИИ', text: 'Закрыты поисковые роботы ответных систем: OAI-SearchBot.' }, { lang: 'ru' });
  is('«сейчас» это сам текст находки', p.now, 'Закрыты поисковые роботы ответных систем: OAI-SearchBot.');
  ok('задача про открытие поисковых роботов', /Открой в robots\.txt/.test(p.task));
  ok('подписи на русском', p.labels.now === 'Сейчас' && p.labels.task === 'Задача' && p.labels.verify === 'Как проверить');
  ok('правило про выдумки на месте', /не выдумывай факты/.test(p.rule));
  const e = firstFixParts({ id: 'llms-missing', text: 'No llms.txt.' }, { lang: 'en' });
  ok('английские подписи', e.labels.now === 'Now' && e.labels.verify === 'How to check');
  ok('незнакомый язык падает в английский', firstFixParts({ id: 'llms-missing', text: 'x' }, { lang: 'de' }).labels.now === 'Now');
}

if (bad) { console.error(`\n${bad} тест(ов) упало`); process.exit(1); }
console.log('\nвсе тесты заданий прошли');
