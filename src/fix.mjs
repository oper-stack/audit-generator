/**
 * Пакет Fix: составление списка работ по чужому сайту и отчёт о закрытии.
 *
 * Страница пакета обещает две вещи: список проверок согласуется письменно до оплаты, и всё, что мы
 * из него не закрыли, возвращается долей. Обещание держится только если список машинный, а не
 * написанный на глаз. Здесь он и рождается: берётся собранный аудит, каждая находка раскладывается
 * на «закроем сами», «нужны факты клиента» и «платформа не позволяет», и на выходе получается
 * письмо клиенту и чек-лист исполнителю.
 *
 * Классификация не про сложность, а про то, чьи знания нужны:
 *   always  закрываем на любой платформе, ничего не спрашивая
 *   files   нужен доступ к исходникам сайта, на готовой CMS не выйдет
 *   client  нужны факты и тексты клиента, это уже Foundation
 *   never   не обещаем вообще: либо не в нашей власти, либо данные платные
 *
 * Язык письма задаётся покупкой, а не догадкой: кто купил за рубли, читает по-русски, кто за
 * доллары, по-английски. Смешивать нельзя, человек должен понимать, за что платит. Названия и
 * значения проверок приходят из аудита, поэтому язык аудита здесь тоже сверяется: русское письмо
 * с английскими названиями проверок это брак, который клиент видит первым.
 */
import { localiseChecks } from './i18n.mjs';
import { agentPrompt } from './prompts.mjs';

/** Что мы делаем по каждой проверке. Без этого «закроем» это слово, а не работа. */
export const FIX_ACTIONS = {
  https: { scope: 'never', why: { ru: 'сертификат выпускает хостинг, это не наша работа', en: 'the certificate is issued by the host, not by us' } },
  www: { scope: 'always', action: { ru: 'Поставить постоянную переадресацию с www на основной адрес и проверить кодом ответа', en: 'Add a permanent redirect from www to the main address and confirm it by response code' } },
  ttfb: { scope: 'never', why: { ru: 'время ответа определяется хостингом клиента, обещать его нельзя', en: 'response time is set by your hosting, so we cannot promise it' } },
  robots: { scope: 'always', action: { ru: 'Переписать robots.txt: убрать лишние запреты, добавить строку с картой сайта', en: 'Rewrite robots.txt: drop the needless blocks, add the sitemap line' } },
  'robots-block': { scope: 'always', action: { ru: 'Снять Disallow: / из блока для всех роботов', en: 'Remove Disallow: / from the all-robots block' } },
  'ai-search-access': { scope: 'always', action: { ru: 'Открыть поисковые роботы ИИ в robots.txt, это они достают страницу для цитаты', en: 'Allow the AI search fetchers in robots.txt: they are what pull a page in to quote it' } },
  'robots-ai': { scope: 'always', action: { ru: 'Зафиксировать политику по обучающим краулерам письменно и привести robots.txt в соответствие', en: 'Write down your policy on training crawlers and make robots.txt match it' } },
  sitemap: { scope: 'always', action: { ru: 'Починить или сгенерировать карту сайта и сослаться на неё из robots.txt', en: 'Fix or generate the sitemap and point robots.txt at it' } },
  'sitemap-foreign': { scope: 'always', action: { ru: 'Убрать из карты сайта адреса на чужих хостах', en: 'Remove URLs on other hosts from the sitemap' } },
  'sitemap-health': { scope: 'always', action: { ru: 'Вычистить из карты сайта адреса, которые отвечают редиректом или ошибкой', en: 'Clear out sitemap URLs that answer with a redirect or an error' } },
  llms: { scope: 'always', action: { ru: 'Сгенерировать llms.txt из корпуса так, чтобы ссылки вели на страницы самого сайта', en: 'Generate llms.txt from the corpus so every link points at a page of this site' } },
  title: { scope: 'always', action: { ru: 'Переписать заголовок главной в пределах 60 знаков', en: 'Rewrite the home page title within 60 characters' } },
  description: { scope: 'always', action: { ru: 'Переписать описание главной, убрать служебный код, уложиться в выдачу', en: 'Rewrite the home page description, strip leftover markup, fit the snippet' } },
  h1: { scope: 'always', action: { ru: 'Оставить на главной ровно один заголовок H1', en: 'Leave exactly one H1 on the home page' } },
  canonical: { scope: 'always', action: { ru: 'Проставить канонический адрес', en: 'Set the canonical address' } },
  viewport: { scope: 'always', action: { ru: 'Задать мобильный viewport и снять запрет масштабирования', en: 'Set the mobile viewport and lift the zoom lock' } },
  og: { scope: 'always', action: { ru: 'Добавить карточки для соцсетей: заголовок, описание, картинка', en: 'Add social cards: title, description, image' } },
  schema: { scope: 'always', action: { ru: 'Добавить разметку организации и сайта на главную', en: 'Add Organization and WebSite markup to the home page' } },
  'faq-schema': { scope: 'always', action: { ru: 'Разметить блоки вопросов и ответов схемой FAQPage', en: 'Mark up question and answer blocks with FAQPage' } },
  'org-schema': { scope: 'always', action: { ru: 'Добавить разметку организации с адресом и профилями', en: 'Add Organization markup with the address and the profiles' } },
  resources: { scope: 'files', action: { ru: 'Сократить число подключаемых файлов и включить годовой кеш для статики', en: 'Cut the number of linked files and set a year-long cache for static assets' } },
  hreflang: { scope: 'always', action: { ru: 'Проставить hreflang, если у сайта несколько языков', en: 'Set hreflang where the site has more than one language' } },
  xmlrpc: { scope: 'always', action: { ru: 'Закрыть открытую точку xmlrpc.php', en: 'Close the open xmlrpc.php endpoint' } },
  alt: { scope: 'always', action: { ru: 'Проставить подписи ко всем картинкам по их содержимому', en: 'Write alt text for every image from what it actually shows' } },
  'h1-sample': { scope: 'always', action: { ru: 'Свести заголовки к одному H1 на страницу', en: 'Reduce headings to one H1 per page' } },
  'dup-titles': { scope: 'always', action: { ru: 'Развести повторяющиеся заголовки страниц', en: 'Separate duplicated page titles' } },
  utility: { scope: 'always', action: { ru: 'Исключить служебные адреса из карты сайта, оставив их доступными людям', en: 'Drop utility URLs from the sitemap while keeping them reachable for people' } },
  dates: { scope: 'always', action: { ru: 'Вывести дату публикации и обновления в разметку страниц', en: 'Expose published and updated dates in the page markup' } },
  'trust-entity': { scope: 'always', action: { ru: 'Добавить город и страну в разметку организации', en: 'Add the city and country to the Organization markup' } },
  'trust-contact': { scope: 'always', action: { ru: 'Опубликовать прямые контакты и вывести их в разметку', en: 'Publish direct contacts and expose them in the markup' } },
  'trust-profiles': { scope: 'always', action: { ru: 'Заявить в разметке профили, которые у клиента действительно есть', en: 'Declare in the markup the profiles you actually have' } },
  'trust-about': { scope: 'always', action: { ru: 'Сделать страницу о компании доступной со всех страниц', en: 'Make the about page reachable from every page' } },
  'trust-policies': { scope: 'always', action: { ru: 'Добавить политику конфиденциальности и условия и сослаться на них из подвала', en: 'Add a privacy policy and terms and link them from the footer' } },
  'conv-contact-path': { scope: 'always', action: { ru: 'Дать способ связаться с любой страницы', en: 'Give a way to get in touch from any page' } },
  'conv-cta': { scope: 'always', action: { ru: 'Поставить призыв к действию в первый экран', en: 'Put a call to action in the first screen' } },
  'conv-form-depth': { scope: 'files', action: { ru: 'Поднять форму выше по странице', en: 'Move the form higher up the page' } },
  'conv-form-fields': { scope: 'files', action: { ru: 'Сократить форму до четырёх полей', en: 'Cut the form down to four fields' } },
  'conv-messenger': { scope: 'always', action: { ru: 'Добавить ссылку на мессенджер', en: 'Add a messenger link' } },
  'answer-first': { scope: 'client', why: { ru: 'первый абзац с цифрой пишется по фактам клиента', en: 'the opening paragraph with a number is written from your facts' } },
  sources: { scope: 'client', why: { ru: 'источник цифры знает только клиент', en: 'only you know where each number came from' } },
  thin: { scope: 'client', why: { ru: 'наполнение тонких страниц это тексты по фактам клиента', en: 'filling thin pages means writing from your facts' } },
  sections: { scope: 'client', why: { ru: 'разбивка на разделы это переписывание текста', en: 'splitting into sections means rewriting the text' } },
  tables: { scope: 'client', why: { ru: 'таблица собирается из данных клиента', en: 'a table is built from your data' } },
  'js-content': { scope: 'files', action: { ru: 'Отдавать текст страницы сразу в HTML, а не дорисовывать его скриптами: предрендер или серверная отрисовка тех страниц, где текст сейчас появляется только в браузере', en: 'Serve the page text in the HTML itself instead of drawing it with scripts: prerender or server-render the pages whose text currently appears only in a browser' } },
  'links-profile': { scope: 'never', why: { ru: 'данные по ссылкам платные и ни в одну оценку не входят', en: 'link data is paid, and it moves no score of ours' } },
};

const OPEN = new Set(['warn', 'bad']);

/** Слова письма и чек-листа. Цифры одни и те же, меняется только язык. */
const T = {
  ru: {
    planTitle: (h) => `# Что мы закроем на сайте ${h}`,
    checkedOn: (d) => `Проверено ${d}. Ниже список работ, который вы согласовываете до оплаты.`,
    willClose: (n) => `## Закроем: ${n} ${plural(n, 'проверка', 'проверки', 'проверок')}`,
    nowIs: 'Сейчас',
    willDo: 'Что сделаем',
    price: (p, c, s) => `Цена: ${p} ${c}. Доля одной проверки ${s} ${c}: если какую-то из списка мы не закроем, эта доля возвращается.`,
    thin: (n, s, c) => `**Скажем прямо: закрывать у вас почти нечего.** ${n} ${plural(n, 'проверка выходит', 'проверки выходят', 'проверок выходят')} по ${s} ${c} за штуку, и это дорого. Сайт в хорошем состоянии. Либо сделайте эти правки сами по списку выше, он для этого и написан, либо посмотрите на пакет Foundation: судя по проверкам, вам нужна работа с текстами, а не с техникой.`,
    nothing: '**Покупать нечего.** Ни одной проверки, которую мы закрываем без ваших фактов, на сайте не открыто. Брать с вас деньги не за что.',
    needsClient: (n) => `## Не входит: нужны ваши факты (${n})`,
    needsClientLead: 'Это работа с текстами, её делает пакет Foundation, и цена у него считается отдельно.',
    notPossible: (n) => `## Не обещаем (${n})`,
    verify: 'Каждую строку вы сможете проверить сами тем же бесплатным инструментом, которым мы её нашли.',
    unlisted: 'проверка не описана в наборе работ, разберём вручную',
    cmsBlocked: 'нужен доступ к исходникам сайта, на готовой системе управления не выйдет',
    listTitle: (h) => `# Чек-лист Fix: ${h}`,
    listHead: (p, price, c, s) => `Платформа: ${p === 'files' ? 'исходники в файлах' : 'готовая система управления'}. Оплачено ${price} ${c}, доля проверки ${s}.`,
    was: 'было',
    todo: 'сделать',
    listTail: 'После работы: повторный прогон и `fix-report`, он скажет, что закрыто и сколько возвращать.',
    reportTitle: (h) => `# Отчёт о работах: ${h}`,
    closedOf: (n, t) => `Закрыто ${n} из ${t}.`,
    openRefund: (n, r, c) => `Не закрыто ${n}, к возврату ${r} ${c}.`,
    noRefund: 'Не закрытого нет, возвращать нечего.',
    closedHead: '## Закрыто',
    openHead: '## Не закрыто, возвращаем долю',
    before: 'Было',
    after: 'Стало',
    nowLabel: 'Сейчас',
    gone: 'проверка исчезла из прогона',
    recheck: 'Любую строку можно перепроверить бесплатным инструментом на oper-stack.ru/ai-visibility/',
  },
  en: {
    planTitle: (h) => `# What we will fix on ${h}`,
    checkedOn: (d) => `Checked ${d}. Below is the list of work you agree to before paying.`,
    willClose: (n) => `## We will close ${n} check${n === 1 ? '' : 's'}`,
    nowIs: 'Now',
    willDo: 'What we do',
    price: (p, c, s) => `Price: ${p} ${c}. One check is worth ${s} ${c}: anything on this list we fail to close comes back to you as that share.`,
    thin: (n, s, c) => `**Plainly: there is little here to fix.** ${n} check${n === 1 ? '' : 's'} at ${s} ${c} each is expensive, and your site is in good shape. Either make these edits yourself from the list above, which is written to be followed, or look at Foundation: judging by the checks, what you need is work on the text, not on the plumbing.`,
    nothing: '**There is nothing to buy.** Not one check we close without your facts is open on this site. There is nothing to charge you for.',
    needsClient: (n) => `## Not included: we need your facts (${n})`,
    needsClientLead: 'This is work on the text. The Foundation package does it, and it is priced separately.',
    notPossible: (n) => `## Not promised (${n})`,
    verify: 'You can verify every line yourself with the same free tool we found it with.',
    unlisted: 'this check is not in our list of standard work; we will look at it by hand',
    cmsBlocked: 'this needs access to the site source; a hosted site builder will not allow it',
    listTitle: (h) => `# Fix checklist: ${h}`,
    listHead: (p, price, c, s) => `Platform: ${p === 'files' ? 'source files' : 'hosted site builder'}. Paid ${price} ${c}, one check is worth ${s}.`,
    was: 'was',
    todo: 'do',
    listTail: 'When the work is done: run the audit again and `fix-report`, it says what closed and what to refund.',
    reportTitle: (h) => `# Work report: ${h}`,
    closedOf: (n, t) => `Closed ${n} of ${t}.`,
    openRefund: (n, r, c) => `${n} not closed, ${r} ${c} to refund.`,
    noRefund: 'Nothing left open, nothing to refund.',
    closedHead: '## Closed',
    openHead: '## Not closed, share refunded',
    before: 'Was',
    after: 'Now',
    nowLabel: 'Now',
    gone: 'the check disappeared from the run',
    recheck: 'Every line can be re-checked with the free tool at oper-stack.com/ai-visibility/',
  },
};

const dict = (lang) => T[lang === 'en' ? 'en' : 'ru'];
const pick = (field, lang) => (field && typeof field === 'object' ? field[lang === 'en' ? 'en' : 'ru'] : field);

/**
 * Список работ по собранному аудиту.
 * @param {object} audit результат collect()
 * @param {{platform?: 'files'|'cms', price?: number, currency?: string, lang?: 'ru'|'en'}} opts
 */
export function buildFixPlan(audit, opts = {}) {
  const platform = opts.platform === 'cms' ? 'cms' : 'files';
  const price = Number(opts.price ?? 249);
  const lang = opts.lang === 'en' ? 'en' : 'ru';
  const currency = opts.currency || (lang === 'en' ? 'USD' : 'RUB');
  const t = dict(lang);

  // Аудит мог быть собран на другом языке. На русский названия проверок переводятся здесь же,
  // обратно на английский нет: английский текст надо собирать заново командой collect --lang en.
  const auditLang = audit.meta?.lang === 'ru' ? 'ru' : 'en';
  const langMismatch = lang === 'en' && auditLang === 'ru';
  const checks = lang === 'ru' && auditLang !== 'ru' ? localiseChecks(audit.checks || [], 'ru') : (audit.checks || []);

  const open = checks.filter((c) => OPEN.has(c.status));
  const unknown = open.filter((c) => !FIX_ACTIONS[c.id]).map((c) => c.id);

  const included = [];
  const needsClient = [];
  const notPossible = [];
  for (const c of open) {
    const rule = FIX_ACTIONS[c.id];
    if (!rule) { needsClient.push({ check: c, why: t.unlisted }); continue; }
    if (rule.scope === 'always') included.push({ check: c, action: pick(rule.action, lang) });
    else if (rule.scope === 'files') {
      if (platform === 'files') included.push({ check: c, action: pick(rule.action, lang) });
      else notPossible.push({ check: c, why: t.cmsBlocked });
    } else if (rule.scope === 'client') needsClient.push({ check: c, why: pick(rule.why, lang) });
    else notPossible.push({ check: c, why: pick(rule.why, lang) });
  }

  const share = included.length ? Math.round((price / included.length) * 100) / 100 : 0;
  // На здоровом сайте закрывать почти нечего, и продавать ему пакет по полной цене нечестно.
  // Порог не выдуман: ниже него доля одной проверки превышает треть чека.
  const thin = included.length > 0 && included.length < 5;
  return { platform, price, currency, lang, langMismatch, included, needsClient, notPossible, share, thin, unknown, checkedAt: audit.meta?.collectedAt, host: audit.meta?.host };
}

/** Письмо клиенту: то, что он согласовывает до оплаты. */
export function renderFixPlan(plan) {
  const t = dict(plan.lang);
  const L = [];
  L.push(t.planTitle(plan.host));
  L.push('');
  L.push(t.checkedOn(String(plan.checkedAt || '').slice(0, 10)));
  L.push('');
  L.push(t.willClose(plan.included.length));
  L.push('');
  plan.included.forEach((x, i) => {
    L.push(`${i + 1}. **${x.check.label}.** ${t.nowIs}: ${x.check.value}`);
    L.push(`   ${t.willDo}: ${x.action}`);
  });
  L.push('');
  L.push(t.price(plan.price, plan.currency, plan.share));
  if (plan.thin) { L.push(''); L.push(t.thin(plan.included.length, plan.share, plan.currency)); }
  if (!plan.included.length) { L.push(''); L.push(t.nothing); }
  if (plan.needsClient.length) {
    L.push('');
    L.push(t.needsClient(plan.needsClient.length));
    L.push('');
    L.push(t.needsClientLead);
    L.push('');
    for (const x of plan.needsClient) L.push(`- **${x.check.label}.** ${x.check.value}. ${x.why}`);
  }
  if (plan.notPossible.length) {
    L.push('');
    L.push(t.notPossible(plan.notPossible.length));
    L.push('');
    for (const x of plan.notPossible) L.push(`- **${x.check.label}.** ${x.why}`);
  }
  L.push('');
  L.push(t.verify);
  return L.join('\n');
}

/**
 * Чек-лист исполнителю: тот же список, но по порядку работы.
 * @param {object} plan результат buildFixPlan
 * @param {{withPrompts?: boolean}} opts withPrompts добавляет задания для ИИ-агента: работа по ним
 *   идёт быстрее, потому что исполнитель не переписывает задачу своими словами.
 */
export function renderFixChecklist(plan, opts = {}) {
  const t = dict(plan.lang);
  const L = [t.listTitle(plan.host), '', t.listHead(plan.platform, plan.price, plan.currency, plan.share), ''];
  plan.included.forEach((x, i) => {
    L.push(`- [ ] ${i + 1}. ${x.check.label} (\`${x.check.id}\`)`);
    L.push(`      ${t.was}: ${x.check.value}`);
    L.push(`      ${t.todo}: ${x.action}`);
    if (opts.withPrompts) {
      L.push('');
      L.push(agentPrompt(x.check, { lang: plan.lang }).split('\n').map((line) => `      ${line}`).join('\n'));
      L.push('');
    }
  });
  L.push('');
  L.push(t.listTail);
  return L.join('\n');
}

/**
 * Отчёт о закрытии: сравнение прогонов до и после по согласованному списку.
 * Возвращает, что закрыто, что осталось, и сколько денег вернуть.
 */
export function buildFixReport(plan, after) {
  const t = dict(plan.lang);
  const now = Object.fromEntries((after.checks || []).map((c) => [c.id, c]));
  const closed = [];
  const stillOpen = [];
  for (const x of plan.included) {
    const c = now[x.check.id];
    if (!c) { stillOpen.push({ ...x, now: t.gone }); continue; }
    if (OPEN.has(c.status)) stillOpen.push({ ...x, now: c.value });
    else closed.push({ ...x, now: c.value });
  }
  const refund = Math.round(stillOpen.length * plan.share * 100) / 100;
  return { host: plan.host, lang: plan.lang, closed, stillOpen, refund, currency: plan.currency, total: plan.included.length };
}

export function renderFixReport(report) {
  const t = dict(report.lang);
  const L = [t.reportTitle(report.host), ''];
  L.push(t.closedOf(report.closed.length, report.total));
  if (report.stillOpen.length) L.push(t.openRefund(report.stillOpen.length, report.refund, report.currency));
  else L.push(t.noRefund);
  L.push('');
  L.push(t.closedHead);
  L.push('');
  for (const x of report.closed) L.push(`- **${x.check.label}.** ${t.before}: ${x.check.value}. ${t.after}: ${x.now}`);
  if (report.stillOpen.length) {
    L.push('');
    L.push(t.openHead);
    L.push('');
    for (const x of report.stillOpen) L.push(`- **${x.check.label}.** ${t.before}: ${x.check.value}. ${t.nowLabel}: ${x.now}`);
  }
  L.push('');
  L.push(t.recheck);
  return L.join('\n');
}

function plural(n, one, few, many) {
  const d = n % 10; const dd = n % 100;
  return d === 1 && dd !== 11 ? one : d >= 2 && d <= 4 && (dd < 10 || dd >= 20) ? few : many;
}
