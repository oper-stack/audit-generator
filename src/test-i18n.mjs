#!/usr/bin/env node
/** Перевод проверок: покрытие, отсутствие английских хвостов, целость чисел. */
import { readFileSync } from 'node:fs';
import { localiseChecks, untranslated, localiseBasisNote } from './i18n.mjs';

let bad = 0;
const ok = (n, c) => { if (!c) { bad++; console.error(`FAIL ${n}`); } else console.log(`ok   ${n}`); };
const is = (n, a, b) => { const g = JSON.stringify(a) === JSON.stringify(b); if (!g) { bad++; console.error(`FAIL ${n}\n  ждали ${JSON.stringify(b)}\n  вышло ${JSON.stringify(a)}`); } else console.log(`ok   ${n}`); };

const files = process.argv.slice(2);
if (!files.length) { console.error('нужен хотя бы один audit.json для проверки покрытия'); process.exit(2); }
const all = [];
for (const f of files) all.push(...JSON.parse(readFileSync(f, 'utf8')).checks);

is('перевод есть для всех собранных проверок', untranslated(all), []);

const ru = localiseChecks(all, 'ru');
is('количество проверок не изменилось', ru.length, all.length);
ok('статусы не тронуты', ru.every((c, i) => c.status === all[i].status));
ok('идентификаторы не тронуты', ru.every((c, i) => c.id === all[i].id));

// в русском тексте не должно остаться английских слов, кроме технических имён
// Технические имена, которые обязаны остаться латиницей. Границы слова здесь не украшение:
// без них \bio\b съедало «io» внутри description, а Estate внутри RealEstateAgent, и тест
// докладывал о несуществующих английских хвостах вроде «descriptn» и «RealAgent».
const SCHEMA_TYPES = 'RealEstateAgent|Corporation|BreadcrumbList|WebPage|Product|Service|Place|Person|ItemList|HowTo|QAPage|NewsArticle|BlogPosting|CollectionPage|AboutPage|ContactPage|SoftwareApplication';
const TECH = new RegExp(`\\b(?:https?|robots\.txt|llms\.txt|sitemap|xmlrpc|HTTP|HTTPS|H1|H2|og:|twitter:|JSON-LD|FAQPage|Organization|WebSite|Article|LocalBusiness|viewport|width|initial-scale|device-width|user-scalable|maximum-scale|Disallow|User-agent|gptbot|google-extended|ccbot|anthropic-ai|claudebot|applebot-extended|facebookbot|meta-externalagent|bytespider|oai-searchbot|chatgpt-user|perplexitybot|claude-searchbot|duckassistbot|applebot|sameAs|com|ru|org|io|me|net|dev|github|npmjs|apify|producthunt|wikidata|moregroup|estate|Content|Type|Cache|Control|OperStack|SEO|AEO|GEO|AI|XML|CMS|PDF|URL|${SCHEMA_TYPES})\\b`, 'gi');
const leftovers = [];
for (const c of ru) {
  for (const field of ['label', 'value', 'comment']) {
    const t = String(c[field] || '')
      .replace(/\/[A-Za-z0-9_\-/.]+\/?/g, ' ')        // пути страниц клиента
      .replace(/\b[a-z-]+:[a-z_:]+/gi, ' ')            // og:title, twitter:summary_large_image
      .replace(/\bhreflang\b/gi, ' ')                  // имя атрибута
      .replace(TECH, '').replace(/[^A-Za-z]/g, ' ');
    const words = t.split(/\s+/).filter((w) => w.length > 3);
    if (words.length) leftovers.push(`${c.id}.${field}: ${words.join(' ')}`);
  }
}
is('английских слов в русском тексте не осталось', leftovers, []);

// числа не потерялись
// Английские тысячи пишутся через запятую, русские слитно: 1,600 и 1600 это одно число.
const digits = (s) => (String(s).replace(/,(?=\d{3}\b)/g, '').match(/\d+/g) || []).join('|');
const lostNumbers = ru.filter((c, i) => {
  const before = digits(all[i].value);
  const after = digits(c.value);
  return before && after && before.split('|').some((n) => !after.split('|').includes(n));
}).map((c) => `${c.id}: было ${digits(all[all.findIndex((x) => x.id === c.id)].value)}, стало ${digits(c.value)}`);
is('числа в тексте сохранились', lostNumbers, []);

is('подпись под оценкой переведена', localiseBasisNote('10 of 11 checks pass, 1 needs attention'), '10 из 11 проверок пройдено, 1 спорная');
is('склонение на пяти', localiseBasisNote('3 of 5 checks pass, 2 need attention'), '3 из 5 проверок пройдено, 2 спорные');
is('провал тоже склоняется', localiseBasisNote('1 of 3 checks pass, 1 needs attention, 1 fails'), '1 из 3 проверок пройдено, 1 спорная, 1 провалена');
is('неизмеренное переводится', localiseBasisNote('not measured: no link data was collected'), 'не измерялось: no link data was collected');

is('английский язык ничего не меняет', localiseChecks(all, 'en'), all);

if (bad) { console.error(`\n${bad} тест(ов) упало`); process.exit(1); }
console.log(`\nперевод проверен на ${all.length} проверках, всё чисто`);
