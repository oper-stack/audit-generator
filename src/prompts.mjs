/**
 * Находка превращается в задание для ИИ-агента.
 *
 * Наш покупатель правит сайт не руками: он открывает Cursor или Claude Code и говорит агенту, что
 * сделать. До сих пор мы отдавали ему список «что не так», а формулировку задания он придумывал
 * сам. Здесь это делается за него: каждая найденная проблема выходит текстом, который вставляется
 * в агента и исполняется без правок.
 *
 * У каждого задания три обязательные части, иначе агент делает не то:
 *   1. Что сейчас: измеренное число, чтобы агент знал точку отсчёта и не чинил уже целое.
 *   2. Что сделать: одно действие, границы, и прямой запрет выдумывать факты о бизнесе.
 *   3. Как проверить: признак, по которому видно, что работа сделана, а не «кажется сделана».
 *
 * Заданий с собственным текстом столько, сколько проверок мы умеем чинить осмысленно. Для
 * остальных собирается общее задание из описания работы: оно короче, но не врёт.
 */
import { FIX_ACTIONS } from './fix.mjs';
import { localiseChecks } from './i18n.mjs';

const P = {
  alt: {
    ru: { task: 'Пройди по шаблонам и контенту сайта и проставь атрибут alt каждой картинке, у которой его нет или он пустой. Подпись описывает своими словами, что изображено, от пяти до пятнадцати слов, без перечисления ключевых слов. Если картинка чисто декоративная, поставь пустой alt="", это правильно и намеренно. Если по имени файла и окружающему тексту непонятно, что на картинке, не выдумывай: собери такие файлы в список в конце ответа и не трогай их.', verify: 'В собранном HTML не осталось картинок без атрибута alt.' },
    en: { task: 'Go through the site templates and content and give every image an alt attribute where it is missing or empty. The text describes in plain words what the image shows, five to fifteen words, no keyword lists. Purely decorative images take an empty alt="", deliberately. Where the file name and the surrounding text do not tell you what the image shows, do not invent it: list those files at the end and leave them alone.', verify: 'No image in the built HTML is left without an alt attribute.' },
  },
  'conv-cta': {
    ru: { task: 'Поставь на первый экран каждой важной страницы одно понятное действие: кнопку или ссылку, которая говорит, что произойдёт после нажатия («Получить расчёт», «Посмотреть цены», «Написать в Telegram»). Одно действие на экран, не три. Текст кнопки бери из того, что реально происходит дальше, не выдумывай новых обещаний и сроков.', verify: 'На каждой такой странице в верхних тридцати процентах высоты есть кликабельное действие.' },
    en: { task: 'Put one clear thing to do in the first screen of every page that matters: a button or link that says what happens next ("Get a quote", "See prices", "Message us"). One action per screen, not three. Take the wording from what actually happens next; do not invent new promises or timings.', verify: 'Every such page has a clickable action within the top thirty percent of its height.' },
  },
  'conv-messenger': {
    ru: { task: 'Добавь в подвал и на страницу контактов прямую ссылку на мессенджер, которым компания действительно пользуется. Ссылка должна открывать диалог, а не страницу профиля. Если ты не знаешь, какой мессенджер используется, не выбирай его сам: оставь место и спроси владельца.', verify: 'Ссылка открывается и ведёт в диалог, а не на общую страницу.' },
    en: { task: 'Add a direct messenger link to the footer and the contact page, for a messenger the business actually uses. The link opens a conversation, not a profile page. If you do not know which messenger they use, do not choose one: leave the slot and ask the owner.', verify: 'The link opens and starts a conversation rather than a general page.' },
  },
  robots: {
    ru: { task: 'Перепиши robots.txt: убери запреты, которые закрывают обычные страницы сайта, оставь закрытыми только служебные адреса (корзина, личный кабинет, поиск по сайту, страницы благодарности). В конце добавь строку Sitemap с полным адресом карты сайта. Ничего не закрывай «на всякий случай»: каждый запрет должен иметь причину.', verify: 'Главная и разделы сайта открыты для всех роботов, в файле есть строка Sitemap, и она отдаёт карту по указанному адресу.' },
    en: { task: 'Rewrite robots.txt: drop the rules that block ordinary pages, keep blocked only the utility addresses (cart, account, site search, thank-you pages). Add a Sitemap line with the full address at the end. Block nothing "just in case": every rule needs a reason.', verify: 'The homepage and sections are open to all robots, the file has a Sitemap line, and that address serves the sitemap.' },
  },
  'ai-search-access': {
    ru: { task: 'Открой в robots.txt роботов, которые достают страницу, чтобы процитировать её в ответе ИИ: OAI-SearchBot, ChatGPT-User, PerplexityBot, Perplexity-User, Claude-SearchBot, Claude-User, DuckAssistBot, Applebot. Это не те роботы, что обучают модели, это те, что приносят вас в ответ на вопрос покупателя. Обучающие краулеры (GPTBot, CCBot, ClaudeBot, Google-Extended) оставь как есть: закрывать их или нет, решает владелец.', verify: 'В robots.txt ни один из перечисленных восьми агентов не запрещён.' },
    en: { task: 'In robots.txt, allow the fetchers that pull a page to quote it in an AI answer: OAI-SearchBot, ChatGPT-User, PerplexityBot, Perplexity-User, Claude-SearchBot, Claude-User, DuckAssistBot, Applebot. These are not the training crawlers; these are the ones that bring you into an answer to a buyer\'s question. Leave the training crawlers (GPTBot, CCBot, ClaudeBot, Google-Extended) as they are: blocking them is the owner\'s call.', verify: 'None of those eight agents is disallowed in robots.txt.' },
  },
  llms: {
    ru: { task: 'Сгенерируй файл llms.txt в корне сайта: заголовок с названием компании и одной строкой о том, чем она занимается, затем разделы по типам страниц, в каждом ссылки вида «- [Заголовок](полный адрес): одно предложение о чём страница». Бери только страницы, открытые для индексации. Не включай страницы с noindex, служебные адреса и то, что отвечает перенаправлением.', verify: 'Файл отдаётся по адресу /llms.txt, все ссылки в нём ведут на страницы этого же сайта и отвечают кодом 200.' },
    en: { task: 'Generate an llms.txt at the site root: a heading with the company name and one line on what it does, then sections by page type, each holding links shaped "- [Title](full URL): one sentence on what the page is". Include only pages open to indexing. Leave out noindex pages, utility addresses, and anything that answers with a redirect.', verify: 'The file is served at /llms.txt, and every link in it points at this site and answers 200.' },
  },
  sitemap: {
    ru: { task: 'Почини карту сайта: она должна содержать все страницы, открытые для индексации, и только их. Убери из неё служебные адреса, страницы с noindex и адреса, отвечающие перенаправлением. Проставь честную дату последнего изменения для каждой страницы, не сегодняшнюю дату для всех.', verify: 'Карта отдаётся по адресу из robots.txt, все адреса в ней отвечают кодом 200, дат «сегодня» у всех страниц нет.' },
    en: { task: 'Fix the sitemap: it must list every page open to indexing and nothing else. Remove utility addresses, noindex pages and anything that answers with a redirect. Give each page an honest last-modified date, not today\'s date for all of them.', verify: 'The sitemap is served at the address in robots.txt, every URL in it answers 200, and the dates are not all today.' },
  },
  title: {
    ru: { task: 'Перепиши заголовок страницы (тег title) так, чтобы он укладывался в 60 знаков и говорил, что на странице, словами, которыми это ищет человек. Название компании в конце только если остаётся место. Не повторяй одно и то же слово дважды и не пиши список ключевых слов через запятую.', verify: 'Длина title не больше 60 знаков, и он отличается от заголовков других страниц.' },
    en: { task: 'Rewrite the page title so it fits 60 characters and says what is on the page, in the words a person would search with. Put the company name at the end only if there is room. Do not repeat a word twice and do not write a comma-separated keyword list.', verify: 'The title is 60 characters or fewer and differs from other pages\' titles.' },
  },
  description: {
    ru: { task: 'Перепиши описание страницы (meta description) в 120-160 знаков: что человек найдёт на странице и почему ему стоит зайти. Одно предложение, без рекламных восклицаний. Убери из него любые остатки кода и шорткодов. Не обещай того, чего на странице нет.', verify: 'Описание есть, его длина от 120 до 160 знаков, и оно описывает именно эту страницу.' },
    en: { task: 'Rewrite the meta description in 120 to 160 characters: what the reader will find on the page and why it is worth opening. One sentence, no exclamation marks. Strip any leftover code or shortcodes. Do not promise anything the page does not have.', verify: 'The description exists, is 120 to 160 characters, and describes this page in particular.' },
  },
  h1: {
    ru: { task: 'Оставь на странице ровно один заголовок первого уровня (H1), он должен совпадать по смыслу с тем, что на странице. Остальные крупные заголовки переведи в H2. Не делай H1 из логотипа и из названия сайта в шапке.', verify: 'На странице ровно один H1, и он про содержание страницы, а не про название сайта.' },
    en: { task: 'Leave exactly one first-level heading (H1) on the page, matching what the page is about. Demote the other large headings to H2. Do not make an H1 out of the logo or the site name in the header.', verify: 'The page has exactly one H1, and it is about the page rather than the site name.' },
  },
  canonical: {
    ru: { task: 'Проставь на каждой странице канонический адрес (link rel="canonical") с полным адресом этой же страницы, включая протокол и домен, без параметров отслеживания. На страницах с постраничной навигацией канонический адрес указывает на саму страницу, а не на первую.', verify: 'На каждой странице есть канонический адрес, он абсолютный и указывает на неё саму.' },
    en: { task: 'Give every page a canonical link with the full address of that same page, protocol and domain included, without tracking parameters. On paginated pages the canonical points at the page itself, not at page one.', verify: 'Every page has a canonical link, absolute, pointing at itself.' },
  },
  og: {
    ru: { task: 'Добавь на страницы карточки для соцсетей и мессенджеров: og:title, og:description, og:image с картинкой не меньше 1200 на 630 точек, og:url. Заголовок и описание бери со страницы, не выдумывай новых. Проверь, что картинка отдаётся по прямой ссылке без авторизации.', verify: 'При вставке ссылки в мессенджер появляется карточка с заголовком, описанием и картинкой.' },
    en: { task: 'Add social cards to the pages: og:title, og:description, og:image at 1200 by 630 or larger, og:url. Take the title and description from the page itself; do not write new ones. Check the image is served over a plain link without authentication.', verify: 'Pasting the link into a messenger shows a card with title, description and image.' },
  },
  schema: {
    ru: { task: 'Добавь на главную страницу разметку организации (schema.org Organization) в формате JSON-LD: название, адрес сайта, логотип, город и страна, почта или телефон, и ссылки на профили компании в других местах. Заполняй только тем, что действительно есть: выдуманный адрес или несуществующий профиль хуже, чем его отсутствие.', verify: 'Разметка проходит проверку в Rich Results Test, и каждое поле в ней соответствует правде.' },
    en: { task: 'Add Organization markup (schema.org, JSON-LD) to the homepage: name, site address, logo, city and country, email or phone, and links to the company\'s profiles elsewhere. Fill it only with what actually exists: an invented address or a profile that is not yours is worse than nothing.', verify: 'The markup passes the Rich Results Test and every field in it is true.' },
  },
  'faq-schema': {
    ru: { task: 'Найди страницы, где уже есть блок вопросов и ответов, и размечай их схемой FAQPage в JSON-LD. Текст в разметке должен слово в слово совпадать с тем, что видит человек на странице. Не добавляй в разметку вопросы, которых на странице нет.', verify: 'Разметка проходит проверку, и каждый вопрос из неё виден на самой странице.' },
    en: { task: 'Find the pages that already carry a questions-and-answers block and mark them up as FAQPage in JSON-LD. The text in the markup must match word for word what a person sees on the page. Do not add questions that are not on the page.', verify: 'The markup validates and every question in it is visible on the page itself.' },
  },
  'trust-entity': {
    ru: { task: 'Допиши в разметку организации город и страну (PostalAddress с addressLocality и addressCountry). Это то, по чему ИИ понимает, кто вы и откуда. Бери реальный адрес компании: если публиковать его полностью не хочется, достаточно города и страны.', verify: 'В разметке организации есть город и страна, и они совпадают с действительностью.' },
    en: { task: 'Add the city and country to the Organization markup (PostalAddress with addressLocality and addressCountry). This is how an AI knows who you are and where. Use the real address: if you would rather not publish it in full, the city and country are enough.', verify: 'The Organization markup carries a city and country, and they are true.' },
  },
  'trust-contact': {
    ru: { task: 'Опубликуй прямые контакты на странице контактов и в подвале: почта, мессенджер, форма. Те же контакты продублируй в разметке организации (contactPoint). Публикуй только те адреса, которые действительно читают: неотвечающий ящик хуже, чем его отсутствие.', verify: 'Контакты видны на странице и присутствуют в разметке, письмо на указанный адрес доходит.' },
    en: { task: 'Publish direct contacts on the contact page and in the footer: email, messenger, form. Mirror the same contacts in the Organization markup (contactPoint). Publish only addresses somebody actually reads: a mailbox nobody opens is worse than none.', verify: 'The contacts are visible on the page and present in the markup, and mail to that address arrives.' },
  },
  dates: {
    ru: { task: 'Выведи на страницах дату публикации и дату последнего изменения: видимой строкой для человека и полями datePublished и dateModified в разметке. Дата изменения должна меняться только тогда, когда текст действительно правился, а не при каждой сборке сайта.', verify: 'На странице видна дата, в разметке есть оба поля, и дата изменения не равна дате сборки.' },
    en: { task: 'Expose the published and last-modified dates on the pages: as a visible line for the reader and as datePublished and dateModified in the markup. The modified date changes only when the text actually changed, not on every build.', verify: 'The page shows a date, the markup carries both fields, and the modified date is not simply the build date.' },
  },
  'answer-first': {
    ru: { task: 'Перепиши начало страницы так, чтобы первый абзац сразу отвечал на вопрос, ради которого страницу открыли: от двадцати до девяноста слов, и в нём должна быть конкретная цифра (цена, срок, доля, количество). Цифру бери у владельца сайта и рядом назови, откуда она. Если цифры нет, не придумывай её: спроси владельца и оставь пометку.', verify: 'Первый абзац после заголовка укладывается в 20-90 слов и содержит цифру с названным источником.' },
    en: { task: 'Rewrite the opening so the first paragraph answers the question the page was opened for: twenty to ninety words, carrying a concrete figure (a price, a timing, a share, a count). Get the figure from the site owner and name its source beside it. If there is no figure, do not invent one: ask the owner and leave a marker.', verify: 'The first paragraph after the heading is 20 to 90 words and carries a figure with a named source.' },
  },
  sources: {
    ru: { task: 'Пройди по абзацам, где есть цифры, и подпиши к каждой, откуда она: ссылкой на первоисточник или словами («по данным реестра за 2026 год»). Если источника нет ни у тебя, ни у владельца, цифру надо убрать, а не оставлять голой. Не ставь ссылку наугад: неверный источник хуже отсутствующего.', verify: 'В каждом абзаце с цифрой есть либо ссылка на чужой сайт, либо названный словами источник.' },
    en: { task: 'Go through the paragraphs carrying figures and name where each came from: a link to the primary source, or words ("per the 2026 registry"). If neither you nor the owner has a source, the figure comes out rather than standing bare. Do not guess a link: a wrong source is worse than none.', verify: 'Every paragraph with a figure carries either an outbound link or a source named in words.' },
  },
  thin: {
    ru: { task: 'Возьми страницы короче трёхсот слов и допиши их фактами, которые знает владелец: условия, цены, сроки, ограничения, частые вопросы покупателей с ответами. Не разбавляй текст водой ради объёма. Если фактов нет, выпиши владельцу список вопросов и оставь страницу как есть.', verify: 'Страница стала длиннее трёхсот слов, и каждый добавленный абзац содержит факт, а не общие слова.' },
    en: { task: 'Take the pages under three hundred words and fill them with facts the owner has: terms, prices, timings, limits, the questions buyers actually ask with the answers. Do not pad for length. Where the facts are missing, write the owner a list of questions and leave the page alone.', verify: 'The page is over three hundred words and every added paragraph carries a fact rather than filler.' },
  },
};

const withLang = (v, lang) => v[lang === 'ru' ? 'ru' : 'en'];

const HEAD = {
  ru: { now: 'Сейчас', task: 'Задача', verify: 'Как проверить', pages: 'Страницы, где это видно', genericVerify: 'Прогони проверку сайта заново: эта строка должна перестать быть проблемой, а остальные не должны испортиться.', rule: 'Правило: не выдумывай факты о бизнесе. Всё, чего нет на сайте и чего тебе не сказали, спрашивай у владельца и оставляй пометку.' },
  en: { now: 'Now', task: 'Task', verify: 'How to check', pages: 'Pages where this shows', genericVerify: 'Run the site check again: this line must stop being a finding, and nothing else may get worse.', rule: 'Rule: invent no facts about the business. Anything not on the site and not told to you, ask the owner and leave a marker.' },
};

/**
 * Задание для ИИ-агента по одной находке.
 * @param {object} check строка проверки из аудита
 * @param {{lang?: 'ru'|'en', urls?: string[]}} opts
 */
export function agentPrompt(check, opts = {}) {
  const lang = opts.lang === 'ru' ? 'ru' : 'en';
  const h = HEAD[lang];
  const own = P[check.id] ? withLang(P[check.id], lang) : null;
  const rule = FIX_ACTIONS[check.id];
  const fallback = rule && rule.action ? withLang(rule.action, lang) : (rule && rule.why ? withLang(rule.why, lang) : check.label);

  const lines = [`### ${check.label}`, '', `**${h.now}:** ${check.value}`, '', `**${h.task}:** ${own ? own.task : fallback}`];
  // Проверка обязательна у каждого задания: без неё агент не знает, когда остановиться.
  lines.push('', `**${h.verify}:** ${own ? own.verify : h.genericVerify}`);
  if (opts.urls && opts.urls.length) { lines.push('', `**${h.pages}:** ${opts.urls.slice(0, 8).join(', ')}`); }
  lines.push('', h.rule);
  return lines.join('\n');
}

/** Все задания по открытым находкам аудита, в порядке важности. */
export function agentPrompts(audit, opts = {}) {
  const lang = opts.lang === 'ru' ? 'ru' : 'en';
  const limit = Number(opts.limit ?? 0);
  // Русский файл по английскому аудиту: названия и значения проверок переводим, иначе владелец
  // читает русское задание с английскими вставками и не понимает, про что оно.
  const source = lang === 'ru' && audit.meta?.lang !== 'ru' ? localiseChecks(audit.checks || [], 'ru') : (audit.checks || []);
  const checks = source.filter((c) => c.status === 'bad' || c.status === 'warn');
  const ordered = [...checks.filter((c) => c.status === 'bad'), ...checks.filter((c) => c.status === 'warn')];
  const chosen = limit > 0 ? ordered.slice(0, limit) : ordered;
  return chosen.map((c) => ({ id: c.id, hasOwnText: Boolean(P[c.id]), text: agentPrompt(c, { lang }) }));
}

/** Файл, который отдаётся клиенту вместе с отчётом. */
export function renderAgentPrompts(audit, opts = {}) {
  const lang = opts.lang === 'ru' ? 'ru' : 'en';
  const host = audit.meta?.host || '';
  const list = agentPrompts(audit, opts);
  const intro = lang === 'ru'
    ? [`# Задания для ИИ-агента: ${host}`, '',
       'Это тот же список находок, что в отчёте, но переписанный так, чтобы его можно было отдать ИИ-агенту (Cursor, Claude Code, любому другому) и он сделал работу. Копируй задание целиком, вместе со строками «Сейчас» и «Как проверить»: без них агент не поймёт, откуда начинать и чем закончить.', '',
       'Делайте по одному заданию за раз и проверяйте результат, прежде чем брать следующее. Агент, которому дали десять задач сразу, делает первую и половину остальных.', '']
    : [`# Prompts for an AI agent: ${host}`, '',
       'This is the same list of findings as in the report, rewritten so you can hand it to an AI agent (Cursor, Claude Code, any other) and it does the work. Copy a task whole, including the "Now" and "How to check" lines: without them the agent does not know where it starts or when it is done.', '',
       'Do one task at a time and check the result before taking the next. An agent given ten tasks at once does the first and half of the rest.', ''];
  return [intro.join('\n').trimEnd(), ...list.map((x) => x.text)].join('\n\n');
}
