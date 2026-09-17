/**
 * AI visibility check: can ChatGPT, Perplexity, Copilot, Claude and Gemini read, understand
 * and cite this site? Public signals only, one homepage fetch plus robots, llms.txt, the
 * sitemap head and up to nine sampled pages, all in parallel, under a hard time budget so it
 * runs inside a serverless function. Plain ESM so the same module runs in Node for tests.
 *
 * Почему девять, а не три. До 17.09.2026 проверка читала главную и три страницы, а на витрине мы
 * собирались написать «другие проверяют одну страницу, мы проверяем десять». Это было бы неправдой:
 * платный аудит читал десять, бесплатная проверка четыре. Замерено: десять страниц укладываются в
 * 598 мс при бюджете 8500, потому что страницы берутся параллельно. Сайту с пятью страницами это не
 * вредит: берётся столько, сколько есть, и отчёт называет настоящее число прочитанного.
 *
 * The measurement is language-neutral; only the words a person reads come from the MESSAGES
 * table below, picked by the `lang` option ('en' by default, 'ru' on oper-stack.ru). Finding ids
 * and area ids never change with the language, so task lists and reports can key on them.
 *
 * This file is also vendored by the Apify actor (OperStack/apify-ai-visibility/src). The two
 * copies must stay byte for byte identical, and `npm test` in the actor fails if they drift.
 * That is why `samplePages` lives here and every caller spreads VISIBILITY_DEFAULTS: a copy that has
 * to differ is a copy nobody keeps in sync, and this one had drifted by 304 lines.
 */

const UA = 'Mozilla/5.0 (compatible; OperStackVisibility/0.1; +https://oper-stack.com/ai-visibility/)';
const MAX_BODY = 600_000;

const AI_AGENTS = [
  { agent: 'oai-searchbot', label: 'ChatGPT search (OAI-SearchBot)', labelRu: 'Поиск ChatGPT (OAI-SearchBot)', kind: 'search' },
  { agent: 'chatgpt-user', label: 'ChatGPT browsing (ChatGPT-User)', labelRu: 'Просмотр страниц ChatGPT (ChatGPT-User)', kind: 'search' },
  { agent: 'gptbot', label: 'OpenAI training (GPTBot)', labelRu: 'Обучение OpenAI (GPTBot)', kind: 'train' },
  { agent: 'perplexitybot', label: 'Perplexity (PerplexityBot)', labelRu: 'Perplexity (PerplexityBot)', kind: 'search' },
  { agent: 'perplexity-user', label: 'Perplexity browsing (Perplexity-User)', labelRu: 'Просмотр страниц Perplexity (Perplexity-User)', kind: 'search' },
  { agent: 'claudebot', label: 'Claude (ClaudeBot)', labelRu: 'Claude (ClaudeBot)', kind: 'train' },
  { agent: 'claude-searchbot', label: 'Claude search (Claude-SearchBot)', labelRu: 'Поиск Claude (Claude-SearchBot)', kind: 'search' },
  { agent: 'claude-user', label: 'Claude browsing (Claude-User)', labelRu: 'Просмотр страниц Claude (Claude-User)', kind: 'search' },
  { agent: 'anthropic-ai', label: 'Anthropic (anthropic-ai)', labelRu: 'Anthropic (anthropic-ai)', kind: 'train' },
  { agent: 'google-extended', label: 'Gemini grounding (Google-Extended)', labelRu: 'Gemini (Google-Extended)', kind: 'train' },
  { agent: 'bingbot', label: 'Copilot and Bing (Bingbot)', labelRu: 'Copilot и Bing (Bingbot)', kind: 'search' },
  { agent: 'applebot-extended', label: 'Apple Intelligence (Applebot-Extended)', labelRu: 'Apple Intelligence (Applebot-Extended)', kind: 'train' },
  { agent: 'ccbot', label: 'Common Crawl (CCBot)', labelRu: 'Common Crawl (CCBot)', kind: 'train' },
  { agent: 'duckassistbot', label: 'DuckDuckGo AI (DuckAssistBot)', labelRu: 'DuckDuckGo AI (DuckAssistBot)', kind: 'search' },
];

/**
 * Готовность по каждому движку отдельно.
 *
 * Простым языком. «Цитируемость 20 из 25» человеку ничего не говорит, а «Gemini 61» говорит сразу.
 * Поэтому те же самые измерения пересобираются в одно число на движок.
 *
 * Здесь не придумано ни одного нового замера. Число собирается ТОЛЬКО из того, что мы уже
 * измерили, и под каждым движком видно, из чего оно сложилось. Это принципиально: конкурент
 * показывает такие числа без объяснения, откуда они, и мы за это его же и критикуем.
 *
 * Почему веса у движков разные. ChatGPT, Perplexity и Claude достают страницу живьём в момент
 * ответа, поэтому у них решает доступ их собственным роботам и то, есть ли что процитировать.
 * Gemini и Copilot отвечают из чужого индекса, Google и Bing, поэтому у них сильнее весит
 * разметка: в индексе страницу сначала надо понять. Веса названы здесь и больше нигде, чтобы
 * их нельзя было тихо поменять в двух местах по-разному.
 *
 * Неизмеренная область в расчёт не идёт вовсе, и оставшиеся веса делятся заново. Правило то же,
 * что и у общего балла: не измерили, значит не считаем ни в плюс, ни в минус.
 */
const LIVE_MIX = Object.freeze({ access: 0.45, content: 0.30, trust: 0.15, entity: 0.10 });
const INDEX_MIX = Object.freeze({ access: 0.30, entity: 0.30, content: 0.25, trust: 0.15 });

const ENGINES = [
  { id: 'chatgpt', label: 'ChatGPT', agents: ['oai-searchbot', 'chatgpt-user'], mix: LIVE_MIX, live: true },
  { id: 'perplexity', label: 'Perplexity', agents: ['perplexitybot', 'perplexity-user'], mix: LIVE_MIX, live: true },
  { id: 'claude', label: 'Claude', agents: ['claude-searchbot', 'claude-user'], mix: LIVE_MIX, live: true },
  { id: 'gemini', label: 'Gemini', agents: ['google-extended'], mix: INDEX_MIX, live: false },
  { id: 'copilot', label: 'Copilot', agents: ['bingbot'], mix: INDEX_MIX, live: false },
];

/**
 * Russian plural form: pl(1, ...) is "страница", pl(2, ...) "страницы", pl(5, ...) "страниц".
 * Two shapes are needed and they differ: a bare count takes the counted form, while "из N"
 * always takes the genitive, which is plural for every N but one. Getting this wrong reads as
 * broken Russian on the one screen we send catalogue traffic to.
 */
const pl = (n, one, few, many) => { const a = Math.abs(n) % 100; const b = a % 10; return a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many; };
const ofPages = (n) => (n === 1 ? 'проверенной страницы' : 'проверенных страниц');

/** Exported so the offline test can assert the Russian forms without hitting the network. */
export const MESSAGES = {
  en: {
    badInput: 'Enter a public site address, for example example.com',
    tooSlow: 'The site took too long to answer',
    badAnswer: (status, url) => `The site answered ${status} for ${url}`,
    // Чаще всего это опечатка в адресе, и сказать об этом надо первым делом, а не после разбора.
    unreachable: (url) => `Nothing answered at ${url}. Most often that is a typo in the address: check the spelling, and if the site really is there, it may be down right now.`,
    botWall: (status) => `The site refuses unknown clients (HTTP ${status}), so this check could not read a single page.`,
    botChallenge: (status) => `The site sits behind a browser challenge (Cloudflare, HTTP ${status}), so this check could not read a single page.`,
    // Что мы знаем про роботов ИИ, когда нас самих развернули: ровно то, что написано в правилах
    // сайта, и ни словом больше. Пускают ли их на самом деле, решает защита, а не мы.
    rulesAllowBots: (list) => ` The site's own rules do allow the AI crawlers (${list}), and sites behind this kind of protection often do let the verified ones through. Whether they get in is decided by the protection, not by this check, so nothing here is counted for or against the site.`,
    rulesBlockBots: (list) => ` The site's own rules also close it to AI crawlers (${list}), so on top of this wall there is a written refusal.`,
    rulesUnknown: ' Its robots.txt could not be read either, so there is nothing to say about AI crawlers: that is not counted for or against the site.',
    howToCheckBots: ' To know for certain, open the server log and look for GPTBot, ClaudeBot and PerplexityBot, or ask whoever runs the protection which bots are on the allowlist.',
    area: { access: 'Can AI crawlers read it', index: 'Is there a map for agents (llms.txt)', entity: 'Is the entity clear (schema)', content: 'Is there something to quote', trust: 'Can it be dated and trusted' },
    engineLive: 'fetches the page live when it answers',
    engineIndex: 'answers from an index, so schema weighs more',
    llmsUnreadable: (status) => `The site did not let this check read llms.txt${status ? ` (HTTP ${status})` : ''}, so whether the site has a map for agents could not be measured. It is not counted for or against the site: a file we were refused is not the same as a file that is not there.`,
    robotsMissing: 'There is no robots.txt on the site. By the standard that means nothing is disallowed, so every AI crawler may read it. A file is not required; add one only when something needs closing off.',
    sampleShort: (read, wanted) => `Only ${read} of ${wanted} pages answered in time, twice in a row, so there was not enough of the site to score. We do not show a number here: a score that goes up because we read less is a score nobody can defend. The site may simply be slow right now; run the check again in a minute.`,
    robotsUnreadable: (status) => `The site did not let this check read robots.txt${status ? ` (HTTP ${status})` : ''}, so whether AI crawlers are allowed could not be measured. It is not counted for or against the site: an unread file is not good news. The owner can open it in a browser, or ask whoever runs the site's protection.`,
    robotsAllBlocked: 'robots.txt disallows the whole site for every crawler. Nothing can read it.',
    fetchersBlocked: (list) => `Blocked answer-engine fetchers: ${list}. These are the bots that cite pages live.`,
    trainingBlocked: (list) => `Blocked training crawlers: ${list}. Models will not learn the brand from the site.`,
    noaiMeta: 'A page carries a noai robots meta tag.',
    allAllowed: (n, signal) => `All ${n} AI crawlers and fetchers are allowed${signal ? ` (Content-Signal: ${signal})` : ''}.`,
    llmsMissing: 'No llms.txt. Answer engines get no map of what the site is and which pages matter.',
    llmsNotText: '/llms.txt answers with an HTML page instead of a text index.',
    llmsForeign: (hosts) => `llms.txt links mostly to other hosts (${hosts}). An AI system may misidentify the business.`,
    llmsOk: (n) => `llms.txt present with ${n} link(s) to the site's own pages.`,
    orgOk: 'Organization or business schema names the entity behind the site.',
    orgMissing: 'No Organization or business schema: AI systems have no entity to attach the site to.',
    faqOk: 'FAQPage schema found, the easiest format for an engine to quote.',
    faqMissing: 'No FAQPage schema on the sampled pages.',
    articleOk: 'Article schema on the sampled pages: an engine can name and date what it is quoting.',
    pageTypeOk: (type) => `${type} schema on the sampled pages: an engine can name what it is quoting.`,
    pageTypeMissing: 'The sampled pages carry no page-level type (Article, Service, Product, Course and the like), so an engine cannot say what kind of thing it is quoting.',
    canonicalMissing: 'The homepage has no canonical tag.',
    ogMissing: 'No Open Graph tags on the homepage: shared links and previews render without a title or image.',
    thinPages: (thin, total) => `${thin} of ${total} sampled page(s) hold under 300 words. Engines rarely cite thin pages.`,
    avgWords: (avg) => `Sampled pages carry ${avg} words on average.`,
    answerFirstMissing: (n, total, where) => `${n} of ${total} measured page(s) open with an answer-first paragraph (20 to 90 words with a figure right after the H1). That paragraph is what gets quoted. Missing on: ${where}.`,
    answerFirstOk: 'Every sampled page opens with an answer-first paragraph carrying a figure.',
    fewH2: (n) => `${n} sampled page(s) have fewer than three H2 sections.`,
    noTables: 'No tables on the measured pages. Tables are the second most quoted format after the first paragraph.',
    measured: (list) => `Measured on these pages: ${list}. Every content finding is a share of them, so a fix on one page moves the score by its share.`,
    homeOnly: 'Only the homepage could be read, so this area is measured on one page rather than several. A sitemap that answers would give a fuller picture.',
    datesMissing: (n) => `${n} sampled page(s) expose no publication or modified date. Engines prefer sources they can date.`,
    datesOk: 'Sampled pages expose publication dates.',
    noFigures: 'The sampled pages state no figures, so there is nothing that needs a source named.',
    sourcesMissing: (n, total) => `${n} of ${total} sampled page(s) state figures without naming where they came from ("according to", "data from").`,
    sourcesOk: 'Every sampled page that states figures names where they came from.',
    sitemapNoLastmod: 'The sitemap carries no lastmod dates.',
    sitemapTimedOut: 'The sitemap did not answer in time, so it was not checked. The score does not count this either way.',
    sitemapMissing: 'No XML sitemap found at the usual paths or in robots.txt.',
  },
  ru: {
    badInput: 'Введите адрес публичного сайта, например example.ru',
    tooSlow: 'Сайт слишком долго не отвечал',
    badAnswer: (status, url) => `Сайт ответил кодом ${status} на ${url}`,
    unreachable: (url) => `По адресу ${url} никто не ответил. Чаще всего это опечатка в адресе: проверьте написание. Если сайт там действительно есть, значит он сейчас недоступен.`,
    botWall: (status) => `Сайт отказывает незнакомым клиентам (код ${status}), поэтому прочитать хотя бы одну страницу проверка не смогла.`,
    botChallenge: (status) => `Сайт закрыт проверкой браузера (Cloudflare, код ${status}), поэтому прочитать хотя бы одну страницу проверка не смогла.`,
    rulesAllowBots: (list) => ` Правила самого сайта роботов ИИ при этом пускают (${list}), а защита такого типа проверенных роботов нередко пропускает. Пустят ли их на деле, решает защита, а не эта проверка, поэтому в плюс или в минус сайту это не зачтено.`,
    rulesBlockBots: (list) => ` Правила самого сайта роботов ИИ тоже закрывают (${list}), то есть к этой стене добавлен ещё и письменный отказ.`,
    rulesUnknown: ' Файл robots.txt прочитать тоже не вышло, поэтому про роботов ИИ сказать нечего, и в плюс или в минус сайту это не зачтено.',
    howToCheckBots: ' Чтобы знать точно, посмотрите в журнале сервера, приходят ли GPTBot, ClaudeBot и PerplexityBot, либо спросите у тех, кто настраивал защиту, кто у неё в белом списке.',
    area: { access: 'Могут ли роботы ИИ прочитать сайт', index: 'Есть ли карта для агентов (llms.txt)', entity: 'Понятно ли, кто вы (разметка)', content: 'Есть ли что процитировать', trust: 'Можно ли датировать и доверять' },
    engineLive: 'достаёт страницу живьём в момент ответа',
    engineIndex: 'отвечает из индекса, поэтому разметка весит больше',
    llmsUnreadable: (status) => `Сайт не дал этой проверке прочитать llms.txt${status ? ` (код ${status})` : ''}, поэтому есть ли у сайта карта для агентов, измерить не вышло. В плюс или в минус это не зачтено: файл, который нам не отдали, это не то же самое, что файла нет.`,
    robotsMissing: 'Файла robots.txt на сайте нет. По стандарту это значит, что не запрещено ничего, то есть читать сайт может любой робот ИИ. Заводить файл необязательно: он нужен, только когда есть что закрывать.',
    sampleShort: (read, wanted) => `Из ${wanted} страниц ответили ${read}, и со второй попытки тоже, поэтому считать балл не по чему. Числа здесь не будет: балл, который растёт оттого, что мы прочитали меньше, защитить нельзя. Возможно, сайт сейчас просто медленный: запустите проверку через минуту.`,
    robotsUnreadable: (status) => `Сайт не дал этой проверке прочитать robots.txt${status ? ` (код ${status})` : ''}, поэтому допущены роботы ИИ или нет, измерить не вышло. В плюс или в минус сайту это не зачтено: непрочитанный файл это не хорошая новость. Владелец может открыть его в браузере сам или спросить у тех, кто настраивал защиту сайта.`,
    robotsAllBlocked: 'robots.txt закрывает весь сайт для всех роботов. Его никто не может прочитать.',
    fetchersBlocked: (list) => `Закрыты поисковые роботы ответных систем: ${list}. Именно они достают страницу, чтобы процитировать её в ответе.`,
    trainingBlocked: (list) => `Закрыты обучающие роботы: ${list}. Модели не узнают о бренде с сайта.`,
    noaiMeta: 'На одной из страниц стоит мета-тег robots со значением noai.',
    allAllowed: (n, signal) => `Все ${n} роботов ИИ допущены на сайт${signal ? ` (Content-Signal: ${signal})` : ''}.`,
    llmsMissing: 'Нет llms.txt. Ответные системы не получают карты: что это за сайт и какие страницы главные.',
    llmsNotText: '/llms.txt отдаёт HTML-страницу вместо текстового указателя.',
    llmsForeign: (hosts) => `Ссылки в llms.txt ведут в основном на чужие домены (${hosts}). Система ИИ может перепутать, чей это бизнес.`,
    llmsOk: (n) => `llms.txt есть, в нём ${n} ${pl(n, 'ссылка', 'ссылки', 'ссылок')} на страницы самого сайта.`,
    orgOk: 'Разметка Organization или бизнеса называет, кто стоит за сайтом.',
    orgMissing: 'Нет разметки Organization или бизнеса: системам ИИ не к кому привязать сайт.',
    faqOk: 'Найдена разметка FAQPage, самый удобный для цитирования формат.',
    faqMissing: 'На проверенных страницах нет разметки FAQPage.',
    articleOk: 'На проверенных страницах есть разметка Article: система может назвать и датировать то, что цитирует.',
    pageTypeOk: (type) => `На проверенных страницах есть разметка ${type}: система может назвать, что именно цитирует.`,
    pageTypeMissing: 'На проверенных страницах нет типа страницы (Article, Service, Product, Course и подобных), поэтому система не может сказать, что за вещь она цитирует.',
    canonicalMissing: 'На главной нет канонического адреса (тега canonical).',
    ogMissing: 'На главной нет тегов Open Graph: ссылка в мессенджерах и соцсетях показывается без заголовка и картинки.',
    thinPages: (thin, total) => (total === 1
      ? 'Единственная проверенная страница короче 300 слов. Короткие страницы цитируют редко.'
      : `Из ${total} ${ofPages(total)} ${thin} короче 300 слов. Короткие страницы цитируют редко.`),
    avgWords: (avg) => `На проверенных страницах в среднем ${avg} ${pl(avg, 'слово', 'слова', 'слов')}.`,
    answerFirstMissing: (n, total, where) => (total === 1
      ? `Единственная проверенная страница не начинается с абзаца-ответа (20-90 слов с цифрой сразу после H1). Именно этот абзац попадает в цитату. Чинить здесь: ${where}.`
      : `Из ${total} ${ofPages(total)} с абзаца-ответа (20-90 слов с цифрой сразу после H1) ${n === 0 ? 'не начинается ни одна' : n === 1 ? 'начинается одна' : `начинаются ${n}`}. Именно этот абзац попадает в цитату. Чинить здесь: ${where}.`),
    answerFirstOk: 'Каждая проверенная страница начинается с абзаца-ответа с цифрой.',
    fewH2: (n, total) => (total === 1
      ? 'У единственной проверенной страницы меньше трёх подзаголовков H2.'
      : `У ${n} из ${total} ${ofPages(total)} меньше трёх подзаголовков H2.`),
    noTables: 'На проверенных страницах нет таблиц. Таблица второй по цитируемости формат после первого абзаца.',
    measured: (list) => `Мерили по этим страницам: ${list}. Каждая находка по содержанию считается долей от них, поэтому правка на одной странице двигает балл на свою долю.`,
    homeOnly: 'Прочитать удалось только главную, поэтому эта область измерена по одной странице, а не по нескольким. Отвечающая карта сайта дала бы полную картину.',
    datesMissing: (n, total) => (total === 1
      ? 'Единственная проверенная страница не показывает дату публикации или изменения. Системы предпочитают источники, которые можно датировать.'
      : `${n} из ${total} ${ofPages(total)} не ${n === 1 ? 'показывает' : 'показывают'} дату публикации или изменения. Системы предпочитают источники, которые можно датировать.`),
    datesOk: 'Проверенные страницы показывают даты публикации.',
    noFigures: 'На проверенных страницах нет цифр, поэтому и источники называть нечему.',
    sourcesMissing: (n, total) => (total === 1
      ? 'Единственная проверенная страница с цифрами не называет, откуда они («по данным», «источник»).'
      : `${n} из ${total} ${ofPages(total)} ${n === 1 ? 'приводит' : 'приводят'} цифры, не называя, откуда они («по данным», «источник»).`),
    sourcesOk: 'Каждая проверенная страница с цифрами называет их источник.',
    sitemapNoLastmod: 'В карте сайта нет дат изменения (lastmod).',
    sitemapTimedOut: 'Карта сайта не ответила вовремя, поэтому её не проверяли. На оценку это не влияет ни в какую сторону.',
    sitemapMissing: 'XML-карта сайта не найдена ни по обычным адресам, ни в robots.txt.',
  },
};

function isPrivateHost(host) {
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  return h.includes(':') || h.startsWith('[');
}

export function normaliseInput(input) {
  let s = String(input || '').trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.') || isPrivateHost(u.hostname)) return null;
  u.hash = ''; u.search = '';
  return u.href;
}

async function get(url, { timeout = 6000, method = 'GET' } = {}) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), timeout);
  const started = Date.now();
  try {
    const res = await fetch(url, { method, redirect: 'follow', signal: c.signal, headers: { 'user-agent': UA, accept: 'text/html,application/xml,text/plain,*/*' } });
    let text = '';
    if (method === 'GET') { const buf = await res.arrayBuffer(); text = new TextDecoder('utf-8', { fatal: false }).decode(buf.slice(0, MAX_BODY)); }
    return { ok: res.ok, status: res.status, url: res.url, type: res.headers.get('content-type') || '', server: res.headers.get('server') || '', mitigated: res.headers.get('cf-mitigated') || '', text, ms: Date.now() - started };
  } catch (e) { return { ok: false, status: 0, url, type: '', text: '', ms: Date.now() - started, error: e.name === 'AbortError' ? 'timeout' : 'unreachable' }; }
  finally { clearTimeout(t); }
}

const strip = (s) => s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const attr = (html, re) => { const m = html.match(re); return m ? m[1].trim() : ''; };

export function parseRobots(text) {
  const blocks = []; let cur = null;
  for (const raw of (text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim(); if (!line) continue;
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i); if (!m) continue;
    const key = m[1].toLowerCase(); const val = m[2].trim();
    if (key === 'user-agent') { if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; blocks.push(cur); } cur.agents.push(val.toLowerCase()); }
    else if (cur && (key === 'allow' || key === 'disallow')) cur.rules.push({ key, val });
  }
  const signal = (text.match(/^content-signal:\s*(.+)$/im) || [])[1] || '';
  return { blocks, signal };
}

/** Effective verdict for one agent: the most specific block wins, then the star block, then allowed. */
export function agentVerdict(robots, agent) {
  const own = robots.blocks.find((b) => b.agents.includes(agent));
  const star = robots.blocks.find((b) => b.agents.includes('*'));
  const block = own || star;
  if (!block) return 'allowed';
  const fullBlock = block.rules.some((r) => r.key === 'disallow' && r.val === '/') && !block.rules.some((r) => r.key === 'allow' && r.val === '/');
  return fullBlock ? 'blocked' : 'allowed';
}

/*
 * Что считается утверждением, требующим источника, и что считается названным источником.
 *
 * Здесь дважды ошибались, и оба раза в сторону несправедливого штрафа. Сначала регулярки знали
 * только английский, и русская страница теряла пять баллов за то, что написана по-русски.
 * Потом выяснилось хуже: собственная цена («от 800 ₽»), длительность своей же встречи
 * («30 до 45 минут») и подписанный словом «иллюстративный» пример весов считались утверждениями
 * о мире, а настоящая ссылка на исследование Harvard Business Review источником не считалась,
 * потому что рядом не стояло оборота «по данным». Стоматолог, который пишет «приём 45 минут,
 * от 3 000 ₽», получал ровно тот же штраф.
 *
 * Поэтому теперь: цена и длительность это факты о себе, они источника не требуют; источником
 * считается не только оборот, но и внешняя ссылка рядом с цифрой; а число, честно подписанное
 * как пример, утверждением не является. \b в JavaScript работает только по латинице, поэтому
 * кириллица огорожена просмотрами вперёд и назад.
 */
const SOURCE_RE = /(?<!\p{L})(according to|source:|sources:|data from|reported by|published by|registry|statistics office|central bank|по данным|источник:|источники:|согласно|по информации|по сведениям|росстат|центробанк|банк россии|росреестр|минфин|минэкономразвития)(?!\p{L})/giu;
/** Число, которое что-то утверждает о мире: доля, объём, расстояние, площадь. */
const CLAIM_FIGURE_RE = /\d[\d,.\s]*\s*(%|percent|процент\w*|km\b|км(?!\p{L})|m²|м²|sqm|кв\.?\s?м|тыс(?!\p{L})|млн(?!\p{L})|млрд(?!\p{L})|thousand|million|billion)/giu;
/*
 * Число в первом абзаце. «Шестнадцать гейтов» это такая же цифра, как «16»: дом стиля многих
 * сайтов (и нашего) требует писать числа словами, и проверка, которая видит только 16, штрафует
 * за грамотность. 13 из 16 наших витрин продуктов попались ровно на этом.
 * «Один» и «one» не в счёт: в обоих языках это слишком часто не число, а оборот речи.
 */
const SPELLED_NUMBER_RE = new RegExp(
  '(?<![A-Za-z])(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)(?![A-Za-z])'
  + '|(?<!\\p{L})(два|две|двух|двум|двумя|три|трёх|трех|трём|трем|тремя|четыре|четырёх|четырех|пять|пяти|шесть|шести|семь|семи|восемь|восьми|девять|девяти|десять|десяти'
  + '|одиннадцат\\p{L}*|двенадцат\\p{L}*|тринадцат\\p{L}*|четырнадцат\\p{L}*|пятнадцат\\p{L}*|шестнадцат\\p{L}*|семнадцат\\p{L}*|восемнадцат\\p{L}*|девятнадцат\\p{L}*'
  + '|двадцат\\p{L}*|тридцат\\p{L}*|сорок|сорока|пятьдесят|пятидесяти|шестьдесят|шестидесяти|семьдесят|восемьдесят|девяносто|сто|ста|двест\\p{L}*|трист\\p{L}*|четырест\\p{L}*|пятьсот'
  + '|тысяч\\p{L}*|миллион\\p{L}*|миллиард\\p{L}*)(?!\\p{L})',
  'iu',
);
/** Абзац-ответ несёт число: цифрой или словом. */
const hasFigure = (text) => /\d/.test(text) || SPELLED_NUMBER_RE.test(text);

/** Число, честно подписанное как пример, не является утверждением. */
const ILLUSTRATIVE_RE = /(иллюстратив\w*|для примера|условн\w+|примерн\w+|illustrative|for example|hypothetical)/giu;
/** Ссылка наружу рядом с цифрой это и есть названный источник. */
const OUTBOUND_LINK_RE = /<a[^>]+href=["']https?:\/\//i;

function analysePage(html, url) {
  const head = html.slice(0, 200_000);
  const title = strip(attr(head, /<title[^>]*>([\s\S]*?)<\/title>/i));
  const description = attr(head, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || attr(head, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  const robotsMeta = attr(head, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i).toLowerCase();
  const canonical = attr(head, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i) || attr(head, /<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["']/i);
  const ogTitle = /property=["']og:title["']/i.test(head);
  const ld = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const types = new Set();
  for (const block of ld) for (const m of block.matchAll(/"@type"\s*:\s*"([A-Za-z]+)"/g)) types.add(m[1]);
  const datePublished = attr(head, /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']*)["']/i) || (ld.join('\n').match(/"datePublished"\s*:\s*"([^"]+)"/) || [])[1] || '';
  const dateModified = attr(head, /<meta[^>]+property=["']article:modified_time["'][^>]+content=["']([^"']*)["']/i) || (ld.join('\n').match(/"dateModified"\s*:\s*"([^"]+)"/) || [])[1] || '';
  // Site chrome is dropped so it cannot be counted as content, with one exception that matters:
  // an article's title block is usually <header><h1>…</h1><p>the answer…</p></header>. Stripping
  // every <header> deleted exactly the paragraph this check looks for, so a page that did open
  // with an answer scored as if it had none. Keep any header that carries the H1.
  const stripChrome = (h) => h
    .replace(/<(nav|footer|aside)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, (block) => (/<h1[\s>]/i.test(block) ? block : ' '));
  const bodyHtml = stripChrome((html.match(/<body[\s\S]*<\/body>/i) || [html])[0]);
  const text = strip(bodyHtml);
  const words = (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
  const h1 = strip((bodyHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || ['', ''])[1]);
  const h2Count = (bodyHtml.match(/<h2[\s>]/gi) || []).length;
  const tables = (bodyHtml.match(/<table[\s>]/gi) || []).length;
  const afterH1 = bodyHtml.split(/<\/h1>/i)[1] || '';
  const firstPara = strip((afterH1.match(/<p[^>]*>([\s\S]*?)<\/p>/i) || ['', ''])[1]);
  const firstParaWords = (firstPara.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
  const answerFirst = firstParaWords >= 20 && firstParaWords <= 90 && hasFigure(firstPara);
  /*
   * Цифру и её источник ищем в одном блоке, а не по всей странице: иначе одно «по данным» внизу
   * прикрывает десять неподписанных чисел сверху. Таблица берётся целиком, потому что подпись
   * («Иллюстративный вес») стоит в шапке, а число в ячейке.
   */
  const tableBlocks = [...bodyHtml.matchAll(/<table[\s\S]*?<\/table>/gi)].map((m) => m[0]);
  const outsideTables = bodyHtml.replace(/<table[\s\S]*?<\/table>/gi, ' ');
  const textBlocks = [...outsideTables.matchAll(/<(p|li|h2|h3|figcaption|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => m[0]);
  let claimFigures = 0;
  let unsourcedFigures = 0;
  for (const block of [...tableBlocks, ...textBlocks]) {
    const blockText = strip(block);
    const found = (blockText.match(CLAIM_FIGURE_RE) || []).length;
    if (!found) continue;
    claimFigures += found;
    const named = Boolean(blockText.match(SOURCE_RE)) || Boolean(blockText.match(ILLUSTRATIVE_RE)) || OUTBOUND_LINK_RE.test(block);
    if (!named) unsourcedFigures += found;
  }
  // Ссылки и картинки считаются по тому же телу, из которого выброшена обвязка сайта: меню и
  // подвал есть на каждой странице одинаково, и в свойствах страницы им делать нечего.
  const links = (bodyHtml.match(/<a[^>]+href=/gi) || []).length;
  const images = (bodyHtml.match(/<img[\s>]/gi) || []).length;
  return { url, title, description, robotsMeta, canonical, ogTitle, schemaTypes: [...types], datePublished, dateModified, words, h1, h2Count, tables, links, images, firstPara: firstPara.slice(0, 220), answerFirst, claimFigures, unsourcedFigures, noai: /noai|noimageai/.test(robotsMeta) };
}


/**
 * Сводит измеренное в одно число на движок. Возвращает и само число, и подписи под ним: какие
 * роботы этого движка пущены, и какая из областей тянет сильнее всего вниз. Без подписей число
 * было бы гаданием, а мы обещаем обратное.
 */
export function engineReadiness(verdicts, parts, T, label = (v) => v.label) {
  const byAgent = new Map(verdicts.map((v) => [v.agent, v]));
  return ENGINES.map((e) => {
    const own = e.agents.map((a) => byAgent.get(a)).filter(Boolean);
    const known = own.filter((v) => v.verdict !== 'unknown');
    const share = {
      // Доступ считается по роботам ЭТОГО движка, а не по всем четырнадцати: закрытый Applebot
      // не мешает ChatGPT процитировать страницу.
      access: known.length ? known.filter((v) => v.verdict !== 'blocked').length / known.length : null,
      entity: parts.entity,
      content: parts.content,
      trust: parts.trust,
    };
    let sum = 0;
    let weight = 0;
    for (const [key, w] of Object.entries(e.mix)) {
      if (share[key] === null || share[key] === undefined) continue;
      sum += share[key] * w;
      weight += w;
    }
    const score = weight ? Math.round((sum / weight) * 100) : null;
    const blocked = own.filter((v) => v.verdict === 'blocked').map(label);
    // Что тянет вниз: самая слабая из измеренных областей, кроме доступа, о нём сказано отдельно.
    const areasByWeak = [['content', share.content], ['trust', share.trust], ['entity', share.entity]]
      .filter(([, v]) => v !== null && v !== undefined)
      .sort((a, b) => a[1] - b[1]);
    const weakest = areasByWeak.length && areasByWeak[0][1] < 0.999 ? T.area[areasByWeak[0][0]] : null;
    return {
      id: e.id,
      label: e.label,
      score,
      how: e.live ? T.engineLive : T.engineIndex,
      blocked,
      weakest,
    };
  });
}

async function readSitemap(origin, robotsText, timeoutFn = () => 3000) {
  const fromRobots = [...(robotsText || '').matchAll(/^sitemap:\s*(\S+)/gim)].map((m) => m[1]);
  const candidates = fromRobots.length
    ? [...fromRobots.slice(0, 2), `${origin}/sitemap_index.xml`, `${origin}/sitemap-index.xml`, `${origin}/sitemap.xml`]
    : [`${origin}/sitemap_index.xml`, `${origin}/sitemap-index.xml`, `${origin}/sitemap.xml`];
  /*
   * "We ran out of time" and "there is no sitemap" are different answers and used to score the
   * same. A slow response once cost a real site three points and made the same site score 78, 81
   * and 84 on different days, which is the one thing a number we sell must never do.
   */
  let timedOut = false;
  for (const u of [...new Set(candidates)]) {
    if (timeoutFn() < 500) { timedOut = true; break; }
    const r = await get(u, { timeout: timeoutFn() });
    if (r.error === 'timeout') { timedOut = true; continue; }
    if (!r.ok || !/<(urlset|sitemapindex)/.test(r.text)) continue;
    let locs = [...r.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
    let lastmod = /<lastmod>/.test(r.text);
    if (/<sitemapindex/.test(r.text) && locs.length && timeoutFn() > 500) {
      const child = await get(locs[0], { timeout: timeoutFn() });
      if (child.ok) { locs = [...child.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]); lastmod = lastmod || /<lastmod>/.test(child.text); }
    }
    return { found: true, url: u, count: locs.length, lastmod, pages: locs.filter((l) => !/\.(xml|pdf|jpe?g|png)$/i.test(l)) };
  }
  return { found: false, url: '', count: 0, lastmod: false, pages: [], timedOut };
}


/**
 * Единственные параметры, с которыми этот балл считается где бы то ни было: на странице проверки,
 * в аудите и в акторе. Если где-то дать больше страниц или времени, число про один и тот же сайт
 * разойдётся, и мы вернёмся к тому, ради чего всё это затевалось.
 */
export const VISIBILITY_DEFAULTS = Object.freeze({ budgetMs: 8500, samplePages: 9 });

/**
 * Что писать владельцу сайта, который нас не пустил.
 *
 * Отдельной функцией намеренно: это самый ответственный текст всей проверки. Он уходит человеку
 * про его собственный сайт, и до 15.09.2026 он врал. Стояло «роботы ИИ её не проходят, поэтому
 * ChatGPT, Perplexity и остальных разворачивают ровно так же». Это вывод о чужом сайте из того,
 * что развернули НАС. Замерено руками на alternativeto.net: тот же адрес отдаёт GPTBot, ClaudeBot
 * и PerplexityBot полную страницу (200, около 900 КБ), а нашей проверке 403. Защита такого типа
 * держит белый список проверенных роботов.
 *
 * Граница проходит здесь: мы знаем, что не пустили нас, и знаем, что написано в robots.txt (его
 * отдают и тогда, когда страницы закрыты). Поведение защиты по отношению к чужим роботам мы не
 * измеряли и утверждать про него не имеем права.
 */
export function blockedNote({ status, challenged, blocked = true, robotsText = null, lang = 'en' } = {}) {
  const T = MESSAGES[lang] || MESSAGES.en;
  const head = challenged ? T.botChallenge(status) : T.botWall(status);
  if (!blocked) return { text: head, botsBlocked: null };
  const rules = robotsText ? parseRobots(robotsText) : null;
  if (!rules) return { text: head + T.rulesUnknown + T.howToCheckBots, botsBlocked: null };
  const closed = AI_AGENTS.filter((a) => agentVerdict(rules, a.agent) === 'blocked');
  const names = (list) => list.slice(0, 3).map((a) => (lang === 'ru' ? a.labelRu : a.label)).join(', ')
    + (list.length > 3 ? (lang === 'ru' ? ` и ещё ${list.length - 3}` : `, and ${list.length - 3} more`) : '');
  const tail = closed.length ? T.rulesBlockBots(names(closed)) : T.rulesAllowBots(names(AI_AGENTS));
  return { text: head + tail + T.howToCheckBots, botsBlocked: closed.length > 0 };
}

export async function checkVisibility(input, { budgetMs = 8500, lang = 'en', samplePages = 9 } = {}) {
  const T = MESSAGES[lang] || MESSAGES.en;
  const agentLabel = (a) => (lang === 'ru' ? a.labelRu : a.label);
  const started = Date.now();
  const deadline = started + budgetMs;
  let grace = 0;
  const left = () => deadline + grace - Date.now();
  const url = normaliseInput(input);
  if (!url) return { ok: false, error: T.badInput };
  const origin = new URL(url).origin; const host = new URL(url).host;
  /*
   * Служебные файлы читаются с одним повтором, и это не украшение.
   *
   * Один ответ решает судьбу целой области: robots.txt стоит 25 очков, llms.txt 15. До 16.09.2026
   * повтора не было, и одна неудачная выборка меняла балл на пятнадцать пунктов. 15.09.2026
   * avtokomissar-app.ru получил 52 на русском сайте и 67 на английском с разницей в две минуты,
   * при том что движок, версия и параметры у обоих одинаковые. Владелец сайта читает такое
   * расхождение как «вы врёте», и он прав.
   *
   * Повторяем только неопределённый ответ: таймаут, отказ защиты, ошибку сервера. Честные 404 и
   * 410 значат, что файла правда нет, их переспрашивать незачем и это удвоило бы запросы почти
   * на каждом сайте.
   */
  const settled = (r) => r.ok || r.status === 404 || r.status === 410;
  const once = (u, ms) => get(u, { timeout: Math.min(ms, left() - 300) });
  const twice = async (u, ms) => {
    const first = await once(u, ms);
    if (settled(first) || left() < 1200) return first;
    const again = await once(u, Math.min(ms, 2500));
    return settled(again) ? again : first;
  };
  const [home, robotsRes, llmsRes] = await Promise.all([
    once(url, 6000),
    twice(`${origin}/robots.txt`, 4000),
    twice(`${origin}/llms.txt`, 4000),
  ]);
  if (!home.ok || !/html/i.test(home.type)) {
    // Код 401/403/405/429 это бот-стена, а не сломанный сайт, и это находка сама по себе: та же
    // стена, что развернула эту проверку, разворачивает и роботов ответных систем.
    const blocked = [401, 403, 405, 429].includes(home.status);
    // Проверка браузера и простой отказ лечатся по-разному, и первое дороже: робот ИИ никогда
    // её не проходит, поэтому сайт за ней невидим для всех ассистентов, что бы ни было на
    // страницах. Пришло из актора Apify, где это работало, а на сайтах человек видел «403».
    const challenged = blocked && (/challenge|managed/i.test(home.mitigated) || (/cloudflare/i.test(home.server) && home.status === 403));

    /*
     * Чего мы НЕ знаем, когда нас развернули.
     *
     * До 15.09.2026 здесь стояло «роботы ИИ её не проходят, поэтому ChatGPT, Perplexity и
     * остальных разворачивают ровно так же». Это вывод о чужом сайте, сделанный из того, что
     * развернули НАС. Проверено руками на alternativeto.net: один и тот же адрес отдаёт GPTBot,
     * ClaudeBot и PerplexityBot полную страницу (200, около 900 КБ), а нашей проверке 403.
     * Защита такого типа держит белый список проверенных роботов и пускает их по адресам, а
     * незнакомого клиента разворачивает. То есть мы писали владельцу сайта неправду про его сайт.
     *
     * Что мы знаем на самом деле: нас не пустили, и что написано в robots.txt. Его отдают и тогда,
     * когда страницы закрыты, поэтому правила прочитать обычно можно. Их и называем, а догадку о
     * поведении защиты не выдаём за измерение.
     */
    const note = blockedNote({ status: home.status, challenged, blocked, robotsText: robotsRes.ok ? robotsRes.text : null, lang });
    const error = home.error === 'timeout' ? T.tooSlow
      : home.error === 'unreachable' || !home.status ? T.unreachable(url)
        : blocked ? note.text
          : T.badAnswer(home.status, url);
    // `botsBlocked` говорит только про написанные правила, а не про поведение защиты: по нему
    // нельзя утверждать, что робота не пустили, можно лишь, что ему не разрешали.
    return { ok: false, blocked, challenged, status: home.status, error, botsBlocked: note.botsBlocked };
  }
  const homePage = analysePage(home.text, home.url);
  const robots = parseRobots(robotsRes.ok ? robotsRes.text : '');
  const sitemap = left() > 1500 ? await readSitemap(origin, robotsRes.ok ? robotsRes.text : '', () => Math.min(3000, left() - 300)) : { found: false, url: '', count: 0, lastmod: false, pages: [], skipped: true };
  let sampled = [];
  /*
   * Сколько страниц выборки мы собирались прочитать. Нужно, чтобы отличить «сайт маленький» от
   * «страницы не успели ответить»: в первом случае меряем по тому, что есть, во втором мерить
   * нечем. Найдено 15.09.2026: habr.com в шести прогонах подряд дал 46, 54, 59 и 69, и выше
   * он выходил там, где успела прочитаться одна страница вместо двух. То есть прочитать меньше
   * выглядело как «стало лучше», а это ровно то, чего продукт обещает не делать.
   */
  let wantedPages = 0;
  if (left() > 2000 && sitemap.pages.length) {
    const norm = (u) => u.replace(/\/$/, '').toLowerCase();
    /*
     * Какие страницы берём в выборку.
     *
     * До 16.09.2026 здесь стояла сортировка по длине адреса по убыванию, то есть наверх
     * поднимались самые глубокие страницы: расшифровки, архивы, служебные разделы. Живой
     * пользователь увидел это на своём сайте: в выборку попали расшифровки на семь тысяч слов.
     * Он чинил витрину, а балл почти не двигался, потому что каждая находка по содержанию
     * считается долей от всех измеренных страниц, и одна поправленная главная из четырёх даёт
     * четверть балла.
     *
     * Теперь берём страницы поближе к корню и по одной из каждого раздела: это то, ради чего
     * сайт сделан, и то, что человек станет чинить. Порядок строго определён, чтобы два прогона
     * по одному сайту брали одни и те же страницы и балл не гулял.
     */
    const depth = (u) => { try { return new URL(u).pathname.replace(/\/$/, '').split('/').filter(Boolean).length; } catch { return 99; } };
    const section = (u) => { try { return new URL(u).pathname.split('/').filter(Boolean)[0] || ''; } catch { return ''; } };
    const candidates = sitemap.pages.filter((p) => norm(p) !== norm(home.url) && p.startsWith(origin));
    const byDepth = [...candidates].sort((a, b) => depth(a) - depth(b) || a.length - b.length || (a < b ? -1 : 1));
    const picks = [];
    const usedSections = new Set();
    for (const p of byDepth) {
      if (picks.length >= samplePages) break;
      const sec = section(p);
      if (usedSections.has(sec)) continue;
      usedSections.add(sec);
      picks.push(p);
    }
    // Разделов может оказаться меньше, чем нужно страниц: добираем ближайшими к корню.
    for (const p of byDepth) {
      if (picks.length >= samplePages) break;
      if (!picks.includes(p)) picks.push(p);
    }
    const read = async (list) => Promise.all(list.map((p) => get(p, { timeout: Math.min(4000, left() - 300) })));
    let rs = await read(picks);
    // Одна повторная попытка по тем, что не ответили: страницы маленькие, а разница в балле
    // между «прочитали две» и «прочитали одну» доходила до двадцати пунктов.
    const failed = picks.filter((p, i) => !(rs[i].ok && /html/i.test(rs[i].type)));
    if (failed.length) {
      // Повтору даётся своё время сверх общего бюджета, один раз и не больше трёх секунд.
      // Без этого на медленном сайте повтор упирался в тот же истёкший бюджет и проверка
      // отказывалась считать балл там, где сайт просто отвечает за пять секунд, а не за две.
      grace = 5000;
      let again = await Promise.all(failed.map((p) => get(p, { timeout: Math.min(3500, left() - 200) })));
      rs = rs.concat(again);
      // Вторая и последняя попытка по тем, что снова молчат: три обращения к странице это
      // предел, дальше мы уже не меряем сайт, а ждём его.
      const stillFailed = failed.filter((p, i) => !(again[i].ok && /html/i.test(again[i].type)));
      if (stillFailed.length && left() > 1200) rs = rs.concat(await Promise.all(stillFailed.map((p) => get(p, { timeout: Math.min(2500, left() - 200) }))));
    }
    sampled = rs.filter((r) => r.ok && /html/i.test(r.type)).map((r) => analysePage(r.text, r.url));
    // Дубли по адресу: повтор мог вернуть ту же страницу, что и первая попытка.
    const seenUrl = new Set();
    sampled = sampled.filter((p) => (seenUrl.has(p.url) ? false : seenUrl.add(p.url)));
    wantedPages = Math.min(picks.length, samplePages);
  }
  const pages = [homePage, ...sampled];

  // llms.txt
  const llmsIsText = llmsRes.ok && !/<html/i.test(llmsRes.text.slice(0, 400));
  const llmsLinks = llmsIsText ? [...llmsRes.text.matchAll(/https?:\/\/[^\s)\]>]+/g)].map((m) => m[0]) : [];
  const llmsForeign = llmsLinks.filter((l) => { try { return !new URL(l).host.endsWith(host.replace(/^www\./, '')); } catch { return false; } });

  // Area 1: access for AI crawlers (25)
  const verdicts = AI_AGENTS.map((a) => ({ ...a, verdict: agentVerdict(robots, a.agent) }));
  const blockedSearch = verdicts.filter((v) => v.kind === 'search' && v.verdict === 'blocked');
  const blockedTrain = verdicts.filter((v) => v.kind === 'train' && v.verdict === 'blocked');
  const starBlocked = agentVerdict(robots, '__none__') === 'blocked';
  const noai = pages.some((p) => p.noai);
  /*
   * robots.txt может не прочитаться, и тогда мерить эту область нечем.
   *
   * До 15.09.2026 такой случай давал полные 25 из 25 и надпись «Все 14 роботов ИИ допущены на
   * сайт»: файла нет, значит запретов нет, значит отлично. Замерено на cian.ru, где robots.txt
   * отдаёт 403, а сайт при этом разворачивает клиента, представившегося GPTBot. Владелец получал
   * отличную оценку за файл, который мы не открывали.
   *
   * Незнание это не хорошая новость. Область помечается неизмеренной, из знаменателя выпадает,
   * и балл считается по тому, что действительно прочитано.
   */
  /*
   * «Файла нет» и «нам его не дали» это разные вещи, и путать их нельзя ни в одну сторону.
   *
   * 404 и 410 это определённый ответ: файла на сайте нет, а по стандарту отсутствие robots.txt
   * означает, что не запрещено ничего. Это измерение, и область получает свои баллы честно.
   * Первая версия правки 15.09.2026 считала неизмеренным любой неуспех, и сайт без robots.txt
   * (таких много среди небольших) терял 25 заслуженных баллов: example.com упал с 30 до 7.
   *
   * Неизмеренное это только отказ и сбой: 401, 403, 405, 429, пятисотые, таймаут, недоступность.
   * Тогда мы действительно не знаем, что в файле написано.
   */
  const robotsMissing = robotsRes.status === 404 || robotsRes.status === 410;
  const robotsRead = robotsRes.ok || robotsMissing;
  let access = 25;
  if (starBlocked) access = 0; else { access -= Math.min(15, blockedSearch.length * 4); access -= Math.min(8, blockedTrain.length * 2); if (noai) access -= 5; }
  access = Math.max(0, access);
  const accessFindings = [];
  if (!robotsRead) accessFindings.push({ id: 'robots-unreadable', level: 'na', text: T.robotsUnreadable(robotsRes.status || 0) });
  else if (robotsMissing && !accessFindings.length) accessFindings.push({ level: 'pass', text: T.robotsMissing });
  if (starBlocked) accessFindings.push({ id: 'robots-all-blocked', level: 'fail', text: T.robotsAllBlocked });
  if (blockedSearch.length) accessFindings.push({ id: 'robots-fetchers-blocked', level: 'fail', text: T.fetchersBlocked(blockedSearch.map(agentLabel).join(', ')) });
  if (blockedTrain.length) accessFindings.push({ id: 'robots-training-blocked', level: 'warn', text: T.trainingBlocked(blockedTrain.map(agentLabel).join(', ')) });
  if (noai) accessFindings.push({ id: 'noai-meta', level: 'warn', text: T.noaiMeta });
  if (!accessFindings.length) accessFindings.push({ level: 'pass', text: T.allAllowed(AI_AGENTS.length, robots.signal) });

  // Area 2: agent index (15)
  /*
   * Та же граница, что у robots.txt: «файла нет» и «нам его не дали» это разные вещи.
   *
   * До 15.09.2026 любой неуспех давал вывод «у вас нет llms.txt» и ноль баллов. На сайте за
   * защитой это выдуманная находка: файл может быть, мы его просто не получили. 404 и 410
   * означают, что файла действительно нет, и вот это честная находка с нулём.
   */
  const llmsMissing = llmsRes.status === 404 || llmsRes.status === 410;
  const llmsRead = llmsRes.ok || llmsMissing;
  let index = 0; const indexFindings = [];
  if (!llmsRead) indexFindings.push({ id: 'llms-unreadable', level: 'na', text: T.llmsUnreadable(llmsRes.status || 0) });
  else if (!llmsRes.ok) indexFindings.push({ id: 'llms-missing', level: 'fail', text: T.llmsMissing });
  else if (!llmsIsText) { index = 3; indexFindings.push({ id: 'llms-not-text', level: 'fail', text: T.llmsNotText }); }
  else if (llmsLinks.length && llmsForeign.length > llmsLinks.length / 2) { index = 5; indexFindings.push({ id: 'llms-foreign', level: 'fail', text: T.llmsForeign([...new Set(llmsForeign.map((l) => new URL(l).host))].slice(0, 3).join(', ')) }); }
  else { index = llmsLinks.length >= 5 ? 15 : 10; indexFindings.push({ level: 'pass', text: T.llmsOk(llmsLinks.length) }); }

  // Area 3: entity and structure (20)
  const allTypes = new Set(pages.flatMap((p) => p.schemaTypes));
  const hasOrg = [...allTypes].some((t) => /Organization|Corporation|NGO|EducationalOrganization|GovernmentOrganization|MedicalOrganization|NewsMediaOrganization|Person|LocalBusiness|RealEstateAgent|Dentist|Physician|Hospital|Pharmacy|VeterinaryCare|LegalService|Attorney|Notary|AccountingService|InsuranceAgency|FinancialService|BankOrCreditUnion|AutomotiveBusiness|AutoRepair|AutoDealer|HomeAndConstructionBusiness|Plumber|Electrician|RoofingContractor|HVACBusiness|HousePainter|Locksmith|MovingCompany|GeneralContractor|Restaurant|FoodEstablishment|CafeOrCoffeeShop|Bakery|BarOrPub|LodgingBusiness|Hotel|TravelAgency|HealthAndBeautyBusiness|BeautySalon|HairSalon|DaySpa|NailSalon|TattooParlor|SportsActivityLocation|HealthClub|Gym|ProfessionalService|Store|ClothingStore|GroceryStore|HardwareStore|FurnitureStore|JewelryStore|PetStore|ChildCare|EmploymentAgency|SelfStorage|Library|Museum|EntertainmentBusiness|MedicalClinic|DentalClinic|Optician|PhysicalTherapy|NutritionService|EmergencyService|ITService|WebDesignService|MarketingAgency|AdvertisingAgency/.test(t));
  const hasFaq = allTypes.has('FAQPage');
  const hasArticle = [...allTypes].some((t) => /Article|BlogPosting|NewsArticle/.test(t));
  /*
   * A page does not have to be an article to be quotable. Asking every site for Article schema
   * marks a correctly typed service, shop, course or job page as missing something, which is the
   * same mistake the check once made by refusing "Dentist" as a business type. What an answer
   * engine needs is a page-level type it can name, so any of these earns the same points.
   */
  const PAGE_TYPES = /^(Service|Product|Course|Event|HowTo|Recipe|SoftwareApplication|WebApplication|MobileApplication|JobPosting|Book|Review|QAPage|MedicalWebPage|CollectionPage|ItemPage|AboutPage|ProfilePage)$/;
  const pageType = [...allTypes].find((t) => PAGE_TYPES.test(t)) || null;
  let entity = 0; const entityFindings = [];
  if (hasOrg) { entity += 8; entityFindings.push({ level: 'pass', text: T.orgOk }); } else entityFindings.push({ id: 'schema-org-missing', level: 'fail', text: T.orgMissing });
  if (hasFaq) { entity += 5; entityFindings.push({ level: 'pass', text: T.faqOk }); } else entityFindings.push({ id: 'schema-faq-missing', level: 'warn', text: T.faqMissing });
  if (hasArticle) {
    entity += 3;
    entityFindings.push({ level: 'pass', text: T.articleOk });
  } else if (pageType) {
    entity += 3;
    entityFindings.push({ level: 'pass', text: T.pageTypeOk(pageType) });
  } else if (sampled.length) {
    entityFindings.push({ id: 'schema-article-missing', level: 'warn', text: T.pageTypeMissing });
  }
  if (homePage.canonical) entity += 2; else entityFindings.push({ id: 'canonical-missing', level: 'warn', text: T.canonicalMissing });
  if (homePage.ogTitle) entity += 2; else entityFindings.push({ id: 'og-missing', level: 'warn', text: T.ogMissing });

  // Area 4: answer-first content (25)
  /*
   * Главная считается наравне с остальными.
   *
   * До 16.09.2026 здесь стояло `sampled.length ? sampled : [homePage]`, то есть главную мы
   * смотрели только когда больше ничего не нашлось. На любом сайте с картой сайта самая важная
   * страница выпадала из оценки содержания целиком: ни таблицы, ни абзац-ответ, ни объём.
   * Живой пользователь добавил таблицу на главную, балл не сдвинулся, и он не понял почему.
   * Понять было нельзя: мы туда не смотрели.
   */
  const contentPages = [homePage, ...sampled];
  /* Say so. A score built from one page is not the same measurement as one built from four. */
  const homeOnly = !sampled.length;
  const thin = contentPages.filter((p) => p.words < 300).length;
  const answerFirst = contentPages.filter((p) => p.answerFirst).length;
  const structured = contentPages.filter((p) => p.h2Count >= 3).length;
  const withTables = contentPages.filter((p) => p.tables > 0).length;
  let content = 0; const contentFindings = [];
  content += Math.round(10 * (1 - thin / contentPages.length));
  if (thin) contentFindings.push({ id: 'thin-pages', level: thin === contentPages.length ? 'fail' : 'warn', text: T.thinPages(thin, contentPages.length) }); else contentFindings.push({ level: 'pass', text: T.avgWords(Math.round(contentPages.reduce((a, p) => a + p.words, 0) / contentPages.length)) });
  content += Math.round(8 * (answerFirst / contentPages.length));
  // Адрес страницы в находке это разница между «полдня искали» и «поправил за минуту»: живой
  // пользователь 16.09.2026 потратил полдня, чтобы понять, какая именно страница виновата.
  const shortPath = (u) => { try { const x = new URL(u); return (x.pathname === '/' ? '/' : x.pathname.replace(/\/$/, '')); } catch { return u; } };
  const pageList = (list) => list.map(shortPath).join(', ');
  if (answerFirst < contentPages.length) contentFindings.push({ id: 'answer-first-missing', level: answerFirst ? 'warn' : 'fail', text: T.answerFirstMissing(answerFirst, contentPages.length, pageList(contentPages.filter((p) => !p.answerFirst).map((p) => p.url))) }); else contentFindings.push({ level: 'pass', text: T.answerFirstOk });
  content += Math.round(4 * (structured / contentPages.length)) + Math.round(3 * (withTables / contentPages.length));
  if (structured < contentPages.length) contentFindings.push({ id: 'few-h2', level: 'warn', text: T.fewH2(contentPages.length - structured, contentPages.length) });
  if (!withTables) contentFindings.push({ id: 'no-tables', level: 'warn', text: T.noTables });
  if (homeOnly) contentFindings.push({ level: 'warn', text: T.homeOnly });
  // Какие именно страницы мы мерили. Без этой строки человек чинит витрину, видит движение балла
  // на один пункт и не понимает, почему: находки считаются долей от всех измеренных страниц.
  contentFindings.push({ level: 'pass', text: T.measured(pageList(contentPages.map((p) => p.url))) });

  // Area 5: freshness and sources (15)
  const dated = contentPages.filter((p) => p.datePublished || p.dateModified).length;
  /*
   * Only a page that states figures can fail to attribute them. Docking a page for naming no
   * source for numbers it does not contain is not a measurement, it is a complaint, and the
   * finding said something untrue about the page. A price and the length of your own meeting
   * are facts about you, not claims about the world, and they never counted here.
   */
  const withFigures = contentPages.filter((p) => p.claimFigures > 0);
  const sourced = withFigures.filter((p) => p.unsourcedFigures === 0).length;
  let trust = 0; const trustFindings = [];
  trust += Math.round(7 * (dated / contentPages.length));
  if (dated < contentPages.length) trustFindings.push({ id: 'dates-missing', level: dated ? 'warn' : 'fail', text: T.datesMissing(contentPages.length - dated, contentPages.length) }); else trustFindings.push({ level: 'pass', text: T.datesOk });
  if (!withFigures.length) {
    trust += 5;
    trustFindings.push({ level: 'pass', text: T.noFigures });
  } else {
    trust += Math.round(5 * (sourced / withFigures.length));
    if (sourced < withFigures.length) {
      trustFindings.push({ id: 'sources-missing', level: 'warn', text: T.sourcesMissing(withFigures.length - sourced, withFigures.length) });
    } else {
      trustFindings.push({ level: 'pass', text: T.sourcesOk });
    }
  }
  if (sitemap.found) {
    trust += sitemap.lastmod ? 3 : 1;
    if (!sitemap.lastmod) trustFindings.push({ id: 'sitemap-no-lastmod', level: 'warn', text: T.sitemapNoLastmod });
  } else if (sitemap.timedOut || sitemap.skipped) {
    // Not measured, so not scored down. Printing a low number for something we never read is the
    // error this check exists to avoid in other people's tools.
    trust += 3;
    trustFindings.push({ level: 'warn', text: T.sitemapTimedOut });
  } else {
    trustFindings.push({ level: 'fail', text: T.sitemapMissing });
  }

  /*
   * Выборка так и не прочитана даже со второй попытки. Балла не будет.
   *
   * Почему не «посчитаем по тому, что успели»: 15.09.2026 один и тот же сайт в шести прогонах
   * дал 46, 54, 59 и 69, и выше он выходил там, где прочиталась одна страница вместо двух.
   * Главная у большинства сайтов лучше внутренних, поэтому меньше чтения выглядело как лучший
   * сайт. Число, которое растёт от того, что мы прочитали меньше, защитить нельзя, поэтому его
   * не показываем вовсе: тот же путь, что у сайта, который нам не ответил.
   */
  if (wantedPages > 0 && sampled.length < wantedPages) {
    return { ok: false, blocked: false, challenged: false, status: home.status, error: T.sampleShort(sampled.length + 1, wantedPages + 1), botsBlocked: [] };
  }
  const sampleOk = true;
  const sampleNote = null;

  const areas = [
    { id: 'access', label: T.area.access, score: robotsRead ? access : null, max: 25, measured: robotsRead, findings: accessFindings },
    { id: 'index', label: T.area.index, score: llmsRead ? index : null, max: 15, measured: llmsRead, findings: indexFindings },
    { id: 'entity', label: T.area.entity, score: entity, max: 20, findings: entityFindings },
    { id: 'content', label: T.area.content, score: sampleOk ? content : null, max: 25, measured: sampleOk, findings: sampleOk ? contentFindings : [sampleNote] },
    { id: 'trust', label: T.area.trust, score: sampleOk ? trust : null, max: 15, measured: sampleOk, findings: sampleOk ? trustFindings : [sampleNote] },
  ];
  /*
   * Балл считается по измеренному и переносится на сто.
   *
   * Неизмеренная область выпадает из знаменателя, а не получает ноль: ноль это утверждение, что
   * там плохо, а мы этого не знаем. Правило одно на весь продукт: не измерили, значит не считаем
   * ни в плюс, ни в минус.
   */
  const measured = areas.filter((a) => a.measured !== false);
  const maxMeasured = measured.reduce((a, x) => a + x.max, 0);
  const rawTotal = measured.reduce((a, x) => a + x.score, 0);
  const total = maxMeasured === 100 ? rawTotal : Math.round((rawTotal / maxMeasured) * 100);
  const grade = total >= 80 ? 'A' : total >= 65 ? 'B' : total >= 45 ? 'C' : total >= 25 ? 'D' : 'E';
  const fixes = areas.flatMap((a) => a.findings.filter((f) => f.level === 'fail').map((f) => ({ id: f.id, area: a.label, text: f.text }))).concat(areas.flatMap((a) => a.findings.filter((f) => f.level === 'warn').map((f) => ({ id: f.id, area: a.label, text: f.text })))).slice(0, 3);
  return {
    ok: true, url: home.url, host, checkedAt: new Date().toISOString(), ms: Date.now() - started,
    score: total, grade, areas, fixes,
    /*
     * Свойства каждой прочитанной страницы. Заголовок, H1, подзаголовки, таблицы, ссылки и
     * картинки считались и раньше, но наружу не отдавались, и человек видел «19 из 25», не видя,
     * из чего это сложилось. Показать то, что уже измерено, дешевле, чем объяснять словами.
     */
    sample: pages.map((p) => ({
      url: p.url, title: p.title, h1: p.h1, words: p.words, h2: p.h2Count, tables: p.tables,
      links: p.links, images: p.images,
      answerFirst: p.answerFirst, dated: Boolean(p.datePublished || p.dateModified),
      schema: p.schemaTypes.slice(0, 4),
    })),
    sitemap: { found: sitemap.found, count: sitemap.count, lastmod: sitemap.lastmod, unchecked: Boolean(!sitemap.found && (sitemap.timedOut || sitemap.skipped)) },
    crawlers: verdicts.map((v) => ({ label: agentLabel(v), kind: v.kind, verdict: v.verdict })),
    engines: engineReadiness(verdicts, {
      access: null, // считается внутри по роботам каждого движка
      entity: entity / 20,
      content: sampleOk ? content / 25 : null,
      trust: sampleOk ? trust / 15 : null,
    }, T, agentLabel),
  };
}
