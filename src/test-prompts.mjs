#!/usr/bin/env node
/** Задания для ИИ-агента: полнота, язык, запрет на выдумки. */
import { agentPrompt, agentPrompts, renderAgentPrompts } from './prompts.mjs';
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

// Шапка файла объясняет, как этим пользоваться
const head = renderAgentPrompts(audit([c('robots', 'bad', 'robots', 'закрыт')]), { lang: 'ru' });
// Проверяем смысл, а не точную формулировку: шапку переписывали под покупателя без терминала.
ok('шапка объясняет, что копировать задачу целиком', /задачу целиком/i.test(head) && /Сейчас/.test(head) && /Как проверить/.test(head));
ok('и предупреждает делать по одной', /по одной за раз/i.test(head));
ok('и обещает, что код знать не нужно', /кода знать не нужно/i.test(head));
ok('в файле нет пустых сдвоенных строк', !/\n\n\n/.test(head));

if (bad) { console.error(`\n${bad} тест(ов) упало`); process.exit(1); }
console.log('\nвсе тесты заданий прошли');
