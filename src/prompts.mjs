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
  'llms-health': {
    ru: { task: 'Пересобери llms.txt из списка живых страниц сайта. Каждый адрес в файле должен отвечать кодом 200 и быть открыт для индексации. Переадресованные адреса замени на конечные, мёртвые убери, закрытые от индексации не включай. Если файл собирается скриптом при сборке, почини скрипт, а не файл: иначе он разъедется снова на следующей выкладке.', verify: 'Каждая ссылка из llms.txt отвечает 200, ни одна не ведёт на переадресацию, и ни у одной нет метки noindex.' },
    en: { task: 'Rebuild llms.txt from the site\'s live pages. Every URL in it must answer 200 and be open to indexing. Replace redirecting URLs with their destination, drop dead ones, leave out anything marked noindex. If the file is generated at build time, fix the generator rather than the file, or it drifts again on the next deploy.', verify: 'Every link in llms.txt answers 200, none redirects, and none carries a noindex marker.' },
  },
  'agent-card': {
    ru: { task: 'Собери файл /.well-known/agent.json: название компании, одна строка о том, чем она занимается, адрес сайта, способ связи и перечень того, что вы предлагаете. Пиши только правду: это читают каталоги агентов, и выдуманная возможность обернётся жалобой. Файл отдавай с типом application/json.', verify: 'Адрес /.well-known/agent.json отвечает 200, тип application/json, и JSON разбирается без ошибок.' },
    en: { task: 'Build a /.well-known/agent.json: the company name, one line on what it does, the site address, a way to get in touch and a list of what you offer. Put only true things in it: agent directories read this, and an invented capability turns into a complaint. Serve it as application/json.', verify: '/.well-known/agent.json answers 200 with application/json and parses as valid JSON.' },
  },
  'agent-markdown': {
    ru: { task: 'Сделай так, чтобы у каждой страницы была markdown-версия того же текста, и объяви её заголовком Link со ссылкой на неё и типом text/markdown. Markdown должен содержать тот же текст, что и страница: заголовки, абзацы, списки и таблицы. Служебную обвязку, меню и подвал в него не клади.', verify: 'Запрос страницы возвращает заголовок Link с text/markdown, и по этой ссылке отдаётся текст той же страницы, а не HTML.' },
    en: { task: 'Give every page a markdown version of the same text and declare it with a Link header pointing at it with type text/markdown. The markdown must carry the same text as the page: headings, paragraphs, lists and tables. Leave the navigation and footer out of it.', verify: 'A request for the page returns a Link header with text/markdown, and that URL serves the text of the same page rather than HTML.' },
  },
  'js-content': {
    ru: { task: 'Найди страницы, где основной текст появляется только после выполнения скриптов, и сделай так, чтобы он отдавался сразу в HTML: предрендер при сборке или серверная отрисовка. Проверить просто: открой адрес страницы командой curl и посмотри, есть ли в ответе текст статьи. Не прячь текст в атрибуты и не дублируй его скрытым блоком ради роботов: это считается обманом и наказывается.', verify: 'В ответе на обычный запрос без браузера виден весь основной текст страницы, а не только каркас.' },
    en: { task: 'Find the pages whose main text appears only after scripts run, and make that text arrive in the HTML itself: prerender at build time or render on the server. Checking is simple: fetch the URL with curl and see whether the article text is in the response. Do not hide the text in attributes and do not duplicate it in a hidden block for robots: that counts as cloaking and is punished.', verify: 'A plain request without a browser returns the whole main text of the page, not just the shell.' },
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

/**
 * Где именно делать правку, смотря на чём собран сайт.
 *
 * Простым языком. Задание «поставьте разметку организации» верно для всех, но человек на WordPress
 * спрашивает «где?», и человек на Astro спрашивает то же про другое место. Раньше он искал сам.
 * Здесь названо конкретное место для четырёх самых частых случаев.
 *
 * Платформа не угадывается: берётся из проверки `cms`, то есть из того, что сайт сам о себе сказал
 * в мета-теге generator. Молчит, значит показываем все варианты, а не выбираем наугад.
 *
 * Добавлено 17.09.2026 после разбора конкурентов: у обоих код правки даётся под конкретный стек, и
 * это единственное место, где их подсказка была полезнее нашей.
 */
const WHERE = {
  'org-schema': {
    wordpress: { ru: 'тема: header.php или functions.php через wp_head, либо плагин разметки', en: 'theme: header.php, or functions.php via wp_head, or a schema plugin' },
    astro: { ru: 'src/layouts, ваш общий макет, внутрь <head>', en: 'src/layouts, your shared layout, inside <head>' },
    next: { ru: 'app/layout.tsx, тег <script type="application/ld+json">', en: 'app/layout.tsx, a <script type="application/ld+json"> tag' },
    shopify: { ru: 'theme.liquid, перед </head>', en: 'theme.liquid, before </head>' },
  },
  'og-title': {
    wordpress: { ru: 'плагин SEO (Yoast, Rank Math) заполняет og:title из заголовка записи', en: 'an SEO plugin (Yoast, Rank Math) fills og:title from the post title' },
    astro: { ru: 'общий макет, где собирается <head>', en: 'the shared layout where <head> is assembled' },
    next: { ru: 'export const metadata, поле openGraph.title', en: 'export const metadata, the openGraph.title field' },
    shopify: { ru: 'theme.liquid, секция мета-тегов', en: 'theme.liquid, the meta tag section' },
  },
  'og-image': {
    wordpress: { ru: 'изображение записи подставляется в og:image плагином SEO', en: 'the featured image becomes og:image through the SEO plugin' },
    astro: { ru: 'общий макет, поле ogImage у страницы', en: 'the shared layout, the page ogImage field' },
    next: { ru: 'export const metadata, поле openGraph.images', en: 'export const metadata, the openGraph.images field' },
    shopify: { ru: 'theme.liquid, мета-теги', en: 'theme.liquid, the meta tags' },
  },
  canonical: {
    wordpress: { ru: 'плагин SEO ставит canonical сам; проверьте, не выключен ли он для этого типа записей', en: 'the SEO plugin sets canonical; check it is not switched off for this post type' },
    astro: { ru: 'общий макет, <link rel="canonical">', en: 'the shared layout, <link rel="canonical">' },
    next: { ru: 'export const metadata, поле alternates.canonical', en: 'export const metadata, the alternates.canonical field' },
    shopify: { ru: 'theme.liquid, {{ canonical_url }}', en: 'theme.liquid, {{ canonical_url }}' },
  },
  favicon: {
    wordpress: { ru: 'Внешний вид, Свойства сайта, Значок сайта', en: 'Appearance, Site Identity, Site Icon' },
    astro: { ru: 'public/favicon.svg и <link rel="icon"> в макете', en: 'public/favicon.svg and <link rel="icon"> in the layout' },
    next: { ru: 'app/icon.png или app/favicon.ico', en: 'app/icon.png or app/favicon.ico' },
    shopify: { ru: 'Настройки темы, Favicon', en: 'Theme settings, Favicon' },
  },
  'redirect-chain': {
    wordpress: { ru: 'плагин переадресаций: замените цепочку одним правилом на конечный адрес', en: 'the redirect plugin: replace the chain with one rule to the final address' },
    astro: { ru: 'vercel.json или netlify.toml, раздел redirects', en: 'vercel.json or netlify.toml, the redirects section' },
    next: { ru: 'next.config.js, функция redirects()', en: 'next.config.js, the redirects() function' },
    shopify: { ru: 'Интернет-магазин, Навигация, Переадресации адресов', en: 'Online Store, Navigation, URL Redirects' },
  },
};

const PLATFORM_LABEL = { wordpress: 'WordPress', astro: 'Astro', next: 'Next.js', shopify: 'Shopify' };

/** На чём собран сайт, по словам самого сайта. Не угадываем: молчит, значит показываем все. */
export function detectPlatform(audit) {
  const cms = (audit?.checks || []).find((c) => c.id === 'cms');
  const said = String(cms?.value || '').toLowerCase();
  if (/wordpress|woocommerce/.test(said)) return 'wordpress';
  if (/astro/.test(said)) return 'astro';
  if (/next/.test(said)) return 'next';
  if (/shopify/.test(said)) return 'shopify';
  return null;
}

function whereLine(id, platform, lang) {
  const map = WHERE[id];
  if (!map) return '';
  const head = lang === 'ru' ? 'Где' : 'Where';
  if (platform && map[platform]) return `**${head}:** ${PLATFORM_LABEL[platform]}, ${map[platform][lang]}`;
  return `**${head}:** ${Object.entries(map).map(([k, v]) => `${PLATFORM_LABEL[k]}, ${v[lang]}`).join('; ')}`;
}

export function agentPrompt(check, opts = {}) {
  const lang = opts.lang === 'ru' ? 'ru' : 'en';
  const h = HEAD[lang];
  const own = P[check.id] ? withLang(P[check.id], lang) : null;
  const rule = FIX_ACTIONS[check.id];
  const fallback = rule && rule.action ? withLang(rule.action, lang) : (rule && rule.why ? withLang(rule.why, lang) : check.label);

  const lines = [`### ${check.label}`, '', `**${h.now}:** ${check.value}`, '', `**${h.task}:** ${own ? own.task : fallback}`];
  // Проверка обязательна у каждого задания: без неё агент не знает, когда остановиться.
  lines.push('', `**${h.verify}:** ${own ? own.verify : h.genericVerify}`);
  const where = whereLine(check.id, opts.platform || null, lang);
  if (where) lines.push('', where);
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
  const platform = opts.platform || detectPlatform(audit);
  return chosen.map((c) => ({ id: c.id, hasOwnText: Boolean(P[c.id]), text: agentPrompt(c, { lang, platform }) }));
}

/** Файл, который отдаётся клиенту вместе с отчётом. */
export function renderAgentPrompts(audit, opts = {}) {
  const lang = opts.lang === 'ru' ? 'ru' : 'en';
  const host = audit.meta?.host || '';
  const list = agentPrompts(audit, opts);
  const intro = lang === 'ru'
    ? [`# Что поправить на сайте: ${host}`, '',
       'Ниже список задач, по одной на каждую найденную проблему. Каждая написана обычными словами, и её можно отдать кому угодно: тому, кто делал вам сайт, или помощнику вроде ChatGPT, Claude или Cursor.', '',
       '**Как пользоваться.** Скопируйте одну задачу целиком, вместе со строками «Сейчас» и «Как проверить»: без них исполнитель не поймёт, откуда начинать и чем закончить. Отдайте её, дождитесь результата, сверьтесь со строкой «Как проверить» и берите следующую.', '',
       'По одной за раз, это важно. Помощник, которому дали десять задач сразу, делает первую и половину остальных.', '',
       'Кода знать не нужно. Ваше дело сказать, что сделать, и посмотреть на результат.', '']
    : [`# What to fix on your site: ${host}`, '',
       'Below is a list of tasks, one for every problem found. Each is written in plain words and can be handed to anyone: whoever built your site, or an assistant like ChatGPT, Claude or Cursor.', '',
       '**How to use it.** Copy one task whole, including the "Now" and "How to check" lines: without them nobody knows where to start or when it is done. Hand it over, wait for the result, check it against "How to check", then take the next one.', '',
       'One at a time, and this matters. An assistant given ten tasks at once does the first and half of the rest.', '',
       'You do not need to know any code. Your job is to say what to do and look at the result.', ''];
  return [intro.join('\n').trimEnd(), ...list.map((x) => x.text)].join('\n\n');
}

/**
 * Первая правка на бесплатной странице тремя частями: что сейчас, что поменять, как проверить.
 *
 * Зачем: бесплатная проверка (`checkVisibility`) отдаёт находки как { id, area, text }, а
 * задания выше написаны по строкам аудита с другими ключами (`llms` против `llms-missing`).
 * Страница показывала только текст находки, а три части приходили лишь письмом. Здесь каждая
 * находка бесплатной проверки сопоставлена с заданием явно, по одному ключу на id; для находок,
 * у которых задания в наборе нет, текст написан тут же. Неизвестный id даёт null: страница
 * тогда честно показывает одну находку, а не чужое указание по чужому сайту.
 *
 * «Сейчас» это сам текст находки: он уже измерен и назван, второй раз не формулируем.
 */
const FIRST_FIX_BY_PROMPT = {
  'robots-all-blocked': 'robots',
  'robots-fetchers-blocked': 'ai-search-access',
  'llms-missing': 'llms',
  'canonical-missing': 'canonical',
  'og-missing': 'og',
  'schema-org-missing': 'schema',
  'schema-faq-missing': 'faq-schema',
  'dates-missing': 'dates',
  'answer-first-missing': 'answer-first',
  'sources-missing': 'sources',
  'thin-pages': 'thin',
};

const FIRST_FIX_OWN = {
  'robots-training-blocked': {
    ru: { task: 'Реши, хочешь ли ты, чтобы модели ИИ учились на сайте. Если да, убери из robots.txt запреты для обучающих роботов, которые названы в строке «Сейчас». Если нет, оставь как есть: это осознанный выбор, а не ошибка, и балл он снижает немного.', verify: 'В robots.txt для названных обучающих роботов нет строки Disallow, либо решение закрыть их записано владельцем словами.' },
    en: { task: 'Decide whether you want AI models to learn from the site. If yes, remove the robots.txt rules that block the training crawlers named under Now. If no, leave it: that is a deliberate choice, not a mistake, and it costs only a little of the score.', verify: 'robots.txt has no Disallow for the training crawlers named, or the decision to keep them out is written down by the owner.' },
  },
  'noai-meta': {
    ru: { task: 'На одной из страниц стоит мета-тег robots со значением noai: он просит системы ИИ не использовать содержимое. Если хочешь, чтобы сайт цитировали в ответах, убери это значение из шаблона страниц. Если это осознанный запрет, оставь.', verify: 'В HTML проверенных страниц нет мета-тега robots со значением noai.' },
    en: { task: 'One of the pages carries a robots meta tag with the value noai: it asks AI systems not to use the content. If you want the site quoted in answers, remove that value from the page template. If the ban is deliberate, leave it.', verify: 'The HTML of the sampled pages has no robots meta tag with the value noai.' },
  },
  'llms-foreign': {
    ru: { task: 'Перепиши llms.txt так, чтобы ссылки в нём вели на страницы этого сайта, а не на чужие домены. Чужую ссылку оставь только там, где без неё нельзя (например, профиль в каталоге), и не в начале файла.', verify: 'Большинство ссылок в llms.txt ведут на этот же домен, и первые из них тоже.' },
    en: { task: 'Rewrite llms.txt so its links point at pages of this site rather than other domains. Keep an outside link only where it cannot be avoided (a directory profile, say), and never at the top of the file.', verify: 'Most links in llms.txt point at this domain, and so do the first ones.' },
  },
  'llms-not-text': {
    ru: { task: 'Адрес /llms.txt отдаёт HTML-страницу вместо текста. Сделай так, чтобы по этому адресу отдавался сам текстовый файл с типом text/plain, а не страница сайта и не заглушка «не найдено» с кодом 200.', verify: '/llms.txt отвечает кодом 200 с типом text/plain, и в ответе текстовый указатель, а не разметка HTML.' },
    en: { task: '/llms.txt serves an HTML page instead of text. Make that address return the text file itself with the type text/plain, not a site page and not a "not found" page with a 200 status.', verify: '/llms.txt answers 200 with text/plain, and the body is a text index rather than HTML markup.' },
  },
  'schema-article-missing': {
    ru: { task: 'Добавь на страницы статей и записей разметку Article или BlogPosting в JSON-LD: заголовок, дата публикации, дата изменения, автор, издатель. Бери данные со страницы, ничего не придумывай.', verify: 'На странице статьи есть JSON-LD с типом Article или BlogPosting, и проверка разметки не показывает ошибок.' },
    en: { task: 'Add Article or BlogPosting markup in JSON-LD to the article pages: headline, date published, date modified, author, publisher. Take the data from the page, invent nothing.', verify: 'An article page carries JSON-LD of type Article or BlogPosting and the markup validator shows no errors.' },
  },
  'few-h2': {
    ru: { task: 'Разбей длинные страницы на разделы: каждый начинается заголовком H2, который звучит как вопрос или тема раздела. На странице должно быть не меньше трёх таких разделов. Ради объёма ничего не дописывай, только структурируй то, что есть.', verify: 'На каждой проверенной странице не меньше трёх заголовков H2, и по ним понятно, о чём страница, без чтения текста.' },
    en: { task: 'Split the long pages into sections, each opening with an H2 that reads as the question or topic of that section. A page needs at least three. Add nothing for length, only structure what is there.', verify: 'Every sampled page has at least three H2 headings, and they alone tell what the page is about.' },
  },
  'no-tables': {
    ru: { task: 'Там, где на странице есть цифры, которые сравнивают (цены, сроки, площади, условия), собери их в таблицу с подписанными столбцами. Строй её только из данных, которые уже есть на странице или у владельца.', verify: 'На страницах со сравниваемыми цифрами есть хотя бы одна настоящая таблица (тег table), а не картинка и не список.' },
    en: { task: 'Where a page has figures that get compared (prices, timings, areas, terms), put them in a table with labelled columns. Build it only from data already on the page or held by the owner.', verify: 'Pages with comparable figures carry at least one real table (a table tag), not an image and not a list.' },
  },
  'sitemap-no-lastmod': {
    ru: { task: 'Проставь в карте сайта (sitemap.xml) каждой странице поле lastmod с настоящей датой последнего изменения содержимого. Дату сборки или сегодняшнее число во все строки не ставь: это хуже, чем пустое поле.', verify: 'У каждого url в sitemap.xml есть lastmod, даты различаются между страницами и совпадают с датой изменения на самой странице.' },
    en: { task: 'Give every page in sitemap.xml a lastmod with the real date its content last changed. Do not stamp the build date or today on every line: that is worse than leaving it empty.', verify: 'Every url in sitemap.xml has a lastmod, the dates differ between pages and match the modified date on the page itself.' },
  },
};

/** Все id находок бесплатной проверки, для которых есть три части. */
export const FIRST_FIX_IDS = [...Object.keys(FIRST_FIX_BY_PROMPT), ...Object.keys(FIRST_FIX_OWN)];

/**
 * @param {{id?: string, area?: string, text?: string}} finding элемент `fixes[]` из `checkVisibility`
 * @param {{lang?: 'ru'|'en'}} opts
 * @returns {{now: string, task: string, verify: string, rule: string, labels: {now: string, task: string, verify: string}}|null}
 */
export function firstFixParts(finding, opts = {}) {
  const lang = opts.lang === 'ru' ? 'ru' : 'en';
  const h = HEAD[lang];
  const id = finding && finding.id;
  const now = String((finding && finding.text) || '').trim();
  if (!id || !now) return null;
  const own = FIRST_FIX_OWN[id] ? withLang(FIRST_FIX_OWN[id], lang)
    : (FIRST_FIX_BY_PROMPT[id] && P[FIRST_FIX_BY_PROMPT[id]] ? withLang(P[FIRST_FIX_BY_PROMPT[id]], lang) : null);
  if (!own || !own.task || !own.verify) return null;
  return { now, task: own.task, verify: own.verify, rule: h.rule, labels: { now: h.now, task: h.task, verify: h.verify } };
}
