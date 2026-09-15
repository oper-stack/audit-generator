#!/usr/bin/env node
/**
 * Сайт нас не пустил. Что мы имеем право сказать про него владельцу.
 *
 * До 15.09.2026 проверка писала: «Роботы ИИ её не проходят, поэтому ChatGPT, Perplexity и
 * остальных разворачивают ровно так же». Это вывод о ЧУЖОМ сайте, сделанный из того, что
 * развернули НАС. Замерено руками на alternativeto.net: тот же адрес отдаёт GPTBot, ClaudeBot
 * и PerplexityBot полную страницу (200, около 900 КБ), а нашей проверке 403. Защита держит
 * белый список проверенных роботов.
 *
 * Здесь держится граница: говорим, что не пустили нас, и что написано в правилах сайта.
 * Про поведение защиты не гадаем.
 */
import { blockedNote } from './visibility.mjs';

let bad = 0;
const ok = (n, c) => { if (c) console.log(`ok   ${n}`); else { bad++; console.error(`FAIL ${n}`); } };

const OPEN = 'User-agent: *\nDisallow: /admin/\n';
const CLOSED = 'User-agent: GPTBot\nDisallow: /\n\nUser-agent: ClaudeBot\nDisallow: /\n';

// ---- главное: ни при каких вводных не утверждать, что роботов ИИ развернули
{
  for (const lang of ['ru', 'en']) {
    for (const [what, robots] of [['правила открыты', OPEN], ['правила закрыты', CLOSED], ['robots не прочитан', null]]) {
      for (const challenged of [true, false]) {
        const t = blockedNote({ status: 403, challenged, robotsText: robots, lang }).text;
        ok(`${lang}/${what}/${challenged ? 'защита' : 'отказ'}: не утверждаем, что роботов ИИ развернули`, lang === 'ru'
          ? !/(разворачивают|не проходят|получают тот же ответ|процитировать (здесь|с сайта) нельзя|нечего)/.test(t.replace('сказать нечего', ''))
          : !/(turned away|do not run one|get the same answer|nothing here can be read)/.test(t));
        ok(`${lang}/${what}/${challenged ? 'защита' : 'отказ'}: сказано, как проверить точно`, lang === 'ru' ? /журнале сервера/.test(t) : /server log/.test(t));
      }
    }
  }
}

// ---- что именно говорим в каждом из трёх случаев
{
  const ru = (robots) => blockedNote({ status: 403, challenged: true, robotsText: robots, lang: 'ru' });
  const en = (robots) => blockedNote({ status: 403, challenged: true, robotsText: robots, lang: 'en' });

  const open = ru(OPEN);
  ok('правила открыты: сказано, что пускают', /правила самого сайта роботов ИИ при этом пускают/i.test(open.text));
  ok('правила открыты: сказано, что не зачтено в минус', /не зачтено/.test(open.text));
  ok('правила открыты: названы конкретные роботы', /OAI-SearchBot|GPTBot/.test(open.text));
  ok('правила открыты: поле говорит «не закрыты»', open.botsBlocked === false);

  const closed = ru(CLOSED);
  ok('правила закрыты: названо письменным отказом', /письменный отказ/.test(closed.text));
  ok('правила закрыты: названы именно закрытые', /GPTBot/.test(closed.text) && /Claude/.test(closed.text));
  ok('правила закрыты: поле говорит «закрыты»', closed.botsBlocked === true);

  const none = ru(null);
  ok('robots не прочитан: молчим про роботов', /про роботов ИИ сказать нечего/.test(none.text));
  ok('robots не прочитан: и это не в минус', /не зачтено/.test(none.text));
  ok('robots не прочитан: поле пустое, а не false', none.botsBlocked === null);

  ok('английский: правила открыты', /rules do allow the AI crawlers/.test(en(OPEN).text));
  ok('английский: правила закрыты', /rules also close it to AI crawlers/.test(en(CLOSED).text));
  ok('английский: robots не прочитан', /robots\.txt could not be read/.test(en(null).text));
}

// ---- защита и простой отказ описываются по-разному: лечатся они тоже по-разному
{
  const ch = blockedNote({ status: 403, challenged: true, robotsText: OPEN, lang: 'ru' }).text;
  const wall = blockedNote({ status: 403, challenged: false, robotsText: OPEN, lang: 'ru' }).text;
  ok('защита названа защитой браузера', /проверкой браузера \(Cloudflare/.test(ch));
  ok('простой отказ назван отказом незнакомым клиентам', /отказывает незнакомым клиентам/.test(wall));
  ok('код ответа назван в обоих', /403/.test(ch) && /403/.test(wall));
}

// ---- чужого языка в тексте нет: его читает человек
{
  const ruText = blockedNote({ status: 403, challenged: true, robotsText: OPEN, lang: 'ru' }).text;
  // Имена роботов это их настоящие идентификаторы, они латиницей и на русском тоже: ChatGPT-User
  // нельзя перевести, иначе владелец не найдёт его в журнале сервера. Вычёркиваем их и смотрим,
  // не осталось ли непереведённых слов.
  const bare = ruText.replace(/ChatGPT-User|OAI-SearchBot|Claude-SearchBot|Claude-User|Applebot-Extended|Google-Extended|anthropic-ai|PerplexityBot|Perplexity-User|Cloudflare|GPTBot|ClaudeBot|ChatGPT|OpenAI|Perplexity|Claude|robots\.txt|Anthropic|Gemini|Bingbot|Copilot|Bing|Apple Intelligence/g, '');
  ok('в русском тексте не осталось английских слов', !/[A-Za-z]{4}/.test(bare));
  ok('в английском нет кириллицы', !/[А-Яа-яЁё]/.test(blockedNote({ status: 403, challenged: true, robotsText: OPEN, lang: 'en' }).text));
}

// ---- несуществующий адрес: человек чаще всего просто опечатался
//
// Стояло «Сайт ответил ничем на https://…»: и коряво, и бесполезно. Человек, который ошибся в
// букве, должен узнать об этом первым делом, а не гадать, что с его сайтом.
{
  const { checkVisibility } = await import('./visibility.mjs');
  for (const lang of ['ru', 'en']) {
    const v = await checkVisibility('https://takogo-domena-tochno-net-4f7a2b9c.ru/', { budgetMs: 8500, samplePages: 3, lang });
    ok(`${lang}: балла у несуществующего адреса нет`, v.ok === false);
    ok(`${lang}: названа вероятная причина, опечатка`, lang === 'ru' ? /опечатка в адресе/.test(v.error) : /typo in the address/.test(v.error));
    ok(`${lang}: сказано, что делать`, lang === 'ru' ? /проверьте написание/.test(v.error) : /check the spelling/.test(v.error));
    ok(`${lang}: нет старого «ответил ничем»`, lang === 'ru' ? !/ответил ничем/.test(v.error) : !/answered nothing/.test(v.error));
    ok(`${lang}: чужого языка нет`, lang === 'ru' ? !/[A-Za-z]{5}/.test(v.error.replace(/https?:\/\/[^\s]+/g, '')) : !/[А-Яа-яЁё]/.test(v.error));
  }
}

if (bad) { console.error(`\n${bad} тест(ов) упало`); process.exit(1); }
console.log('\nпро чужой сайт говорим только измеренное');
