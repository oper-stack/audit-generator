/**
 * Кому писать первым и что сказать.
 *
 * Пакетный прогон отдаёт двадцать отчётов по десять страниц каждый, и дальше человек три часа
 * читает их подряд, чтобы понять, у кого дыра, а у кого мелочь. Здесь эти три часа сводятся к
 * одной таблице: сайты по возрастанию оценки, две-три худшие находки и одна фраза, которую можно
 * поставить в письмо.
 *
 * Фраза не сочиняется. Она берётся из проверки, которая уже что-то измерила, и переводится на
 * язык владельца бизнеса. Там, где перевода нет, печатается сама находка: пусть сухо, но правда.
 */

/**
 * Что сказать владельцу про каждую находку. Здесь только те проверки, по которым владельцу
 * действительно есть что услышать: остальные важны исполнителю, а не в первом письме.
 *
 * Правило для каждой строки: это последствие для его бизнеса, а не название проверки.
 */
export const OWNER_LINES = {
  'robots': {
    en: 'Your site tells robots to skip part of it and never shows them the sitemap.',
    ru: 'Служебный файл сайта запрещает роботам часть страниц и не показывает им карту сайта.',
  },
  'sitemap': {
    en: 'There is no working sitemap, so a search engine simply never finds some of your pages.',
    ru: 'У сайта нет рабочей карты, поэтому часть страниц поисковик просто не находит.',
  },
  'sitemap-health': {
    en: 'Your sitemap points at pages that have moved or no longer exist.',
    ru: 'Карта сайта ведёт на страницы, которых уже нет или которые переехали.',
  },
  'ai-search-access': {
    en: 'ChatGPT and Perplexity cannot read your site: one line in a config file shuts them out.',
    ru: 'ChatGPT и Perplexity не могут прочитать ваш сайт: доступ закрыт в одной строке служебного файла.',
  },
  'llms': {
    en: 'An assistant asked about you has no way to know which of your pages to read, so it reads whichever it hits first.',
    ru: 'Ассистенту, которого спросили про вас, нечем понять, какие ваши страницы читать, и он берёт первую попавшуюся.',
  },
  'llms-health': {
    en: 'You do have the file assistants look for, but its links lead nowhere.',
    ru: 'Файл для ассистентов у вас есть, но ссылки в нём ведут в никуда.',
  },
  'agent-card': {
    en: 'There is nothing on the site telling an AI agent who you are and how to reach you.',
    ru: 'На сайте нет карточки, по которой программа-агент понимает, кто вы и как с вами связаться.',
  },
  'agent-markdown': {
    en: 'Assistants have to parse your layout to read you, because no clean text copy of the pages exists.',
    ru: 'Ассистенту приходится разбирать вёрстку, потому что чистой текстовой копии страниц нет.',
  },
  'org-schema': {
    en: 'Your markup does not say who you are: no address, no profiles to check you against.',
    ru: 'В разметке не указано, кто вы: ни адреса, ни профилей, по которым вас можно сверить.',
  },
  'schema': {
    en: 'Nothing in your markup tells a search engine what this organisation is or what it does.',
    ru: 'Поисковик не понимает по разметке, что это за организация и чем она занимается.',
  },
  'faq-schema': {
    en: 'Your questions and answers are not marked up, so they never appear as an answer in search.',
    ru: 'Вопросы и ответы не размечены, поэтому в выдачу как ответ они не попадают.',
  },
  'title': {
    en: 'The title of your home page does not say what you do, and that is the first thing both a person and a machine read.',
    ru: 'Заголовок главной страницы не говорит, чем вы занимаетесь, а это первое, что видят и человек, и машина.',
  },
  'description': {
    en: 'The description shown in search results is not written, so the engine assembles one from scraps of your text.',
    ru: 'Описание страницы в выдаче не написано, поэтому поисковик собирает его сам из обрывков текста.',
  },
  'h1': {
    en: 'The home page has several top-level headings at once, so it is unclear which one is the subject.',
    ru: 'На главной несколько главных заголовков сразу, и непонятно, какой из них про что.',
  },
  'dup-titles': {
    en: 'Several of your pages carry the same title, so a search engine cannot tell them apart.',
    ru: 'У нескольких страниц одинаковые заголовки, и поисковик не отличает их друг от друга.',
  },
  'alt': {
    en: 'Your images carry no captions, so neither image search nor a blind visitor can make sense of them.',
    ru: 'У картинок нет подписей, поэтому ни поиск по картинкам, ни незрячий посетитель их не понимают.',
  },
  'viewport': {
    en: 'On a phone your page cannot be pinched to zoom: the code forbids it.',
    ru: 'С телефона страницу нельзя увеличить пальцами, масштабирование запрещено в коде.',
  },
  'answer-first': {
    en: 'Not one page opens with a short direct answer, and that opening is exactly what gets quoted.',
    ru: 'Ни на одной странице нет короткого прямого ответа в первом абзаце, а цитируют именно его.',
  },
  'tables': {
    en: 'Your pages have no tables, and a table is the easiest thing for an assistant to lift and quote.',
    ru: 'На страницах нет таблиц, а таблицу ассистенту проще всего взять и процитировать.',
  },
  'sections': {
    en: 'Your pages run as long unbroken text, so an assistant cannot pick out the part that answers the question.',
    ru: 'Страницы идут сплошным текстом, и ассистент не может выделить кусок, который отвечает на вопрос.',
  },
  'sources': {
    en: 'Your pages carry figures but never say where they came from, so nobody can cite them.',
    ru: 'Цифры на страницах есть, но не сказано, откуда они взяты, и сослаться на них нельзя.',
  },
  'dates': {
    en: 'Your pages do not show when they were updated, so they read as stale even when they are not.',
    ru: 'На страницах не видно, когда их обновляли, и выглядят они устаревшими, даже если это не так.',
  },
  'thin': {
    en: 'Several pages are too short to answer anything, and a short page is not quoted.',
    ru: 'Несколько страниц слишком короткие, чтобы на чём-то отвечать, а короткую страницу не цитируют.',
  },
  'trust-entity': {
    en: 'Your structured data has no postal address, so there is nothing to verify the business against.',
    ru: 'В данных о компании нет почтового адреса, и сверить бизнес не с чем.',
  },
  'trust-profiles': {
    en: 'There is nothing to check you against from the outside: no profile on any other platform was found.',
    ru: 'Вас не на что сверить со стороны: ни одного профиля на других площадках не нашлось.',
  },
  'trust-contact': {
    en: 'The site does not give a plain way to reach a human, which both buyers and search engines look for.',
    ru: 'На сайте нет понятного способа связаться с человеком, а его ищут и покупатели, и поисковик.',
  },
  'trust-about': {
    en: 'There is no page saying who is behind the business, and that is one of the first things checked.',
    ru: 'Нет страницы о том, кто стоит за бизнесом, а это проверяют одним из первых.',
  },
  'trust-policies': {
    en: 'The site has no terms or privacy page, which costs trust with both buyers and platforms.',
    ru: 'На сайте нет условий и политики конфиденциальности, и это стоит доверия и покупателей, и площадок.',
  },
  'conv-cta': {
    en: 'Most pages hide the call to action far down, so a visitor who is ready to act has to hunt for it.',
    ru: 'На большинстве страниц призыв к действию спрятан далеко вниз, и готовый покупатель его ищет.',
  },
  'conv-form-depth': {
    en: 'Your enquiry form sits past the middle of the page, and most phone visitors never scroll that far.',
    ru: 'Форма заявки стоит за серединой страницы, а большинство посетителей с телефона так далеко не листают.',
  },
  'conv-form-fields': {
    en: 'The enquiry form asks for too much at once, and every extra field costs replies.',
    ru: 'Форма заявки спрашивает слишком много сразу, и каждое лишнее поле стоит ответов.',
  },
  'conv-contact-path': {
    en: 'Getting from a page to a way of contacting you takes more steps than it should.',
    ru: 'Путь от страницы до способа связаться длиннее, чем нужно.',
  },
  'utility': {
    en: 'Some pages exist that nobody should land on from search, and they dilute the rest.',
    ru: 'Есть страницы, на которые из поиска попадать не должны, и они размывают остальные.',
  },
};

/**
 * Чем открывать письмо. Порядок здесь не по тяжести проверки, а по силе для владельца: закрытый
 * доступ роботов ИИ он поймёт мгновенно, а «есть лишние страницы» не значит для него ничего, хотя
 * формально обе находки одного веса. Первая же строка решает, дочитают письмо или нет.
 */
const LEAD_ORDER = [
  'ai-search-access', 'llms', 'llms-health', 'answer-first', 'sources', 'schema', 'org-schema',
  'agent-card', 'conv-form-depth', 'conv-cta', 'title', 'description', 'tables', 'sections',
  'trust-profiles', 'trust-entity', 'trust-contact', 'faq-schema', 'sitemap', 'sitemap-health',
  'robots', 'thin', 'dup-titles', 'alt', 'viewport', 'trust-about', 'trust-policies',
  'conv-form-fields', 'conv-contact-path', 'agent-markdown', 'h1', 'dates', 'utility',
];

/** Фраза владельцу на нужном языке. Нет перевода, значит нет фразы, и печатается сама находка. */
const line = (id, lang = 'en') => (OWNER_LINES[id] || {})[lang === 'ru' ? 'ru' : 'en'] || '';

/** Вес области при подсчёте одной общей оценки. Считаем только то, что правда измерено. */
const WEIGHT = {
  'SEO, technical': 1,
  'SEO, content and structure': 1.2,
  'AEO, answers and snippets': 1.3,
  'GEO, visibility in AI systems': 1.3,
  'Off-page and trust': 0.8,
  'Conversion and UX': 0.8,
};

/**
 * Одна оценка на сайт из шести областей. Неизмеренная область не занижает и не завышает:
 * она просто не участвует, потому что оценивать неизмеренное значит выдумывать.
 */
export function overallScore(scores = {}) {
  let sum = 0;
  let weight = 0;
  for (const [area, value] of Object.entries(scores)) {
    if (typeof value !== 'number') continue;
    const w = WEIGHT[area] ?? 1;
    sum += value * w;
    weight += w;
  }
  if (!weight) return null;
  return Math.round((sum / weight) * 10);
}

const SEVERITY = { fail: 0, warn: 1 };

/** Худшие находки по одному сайту: сначала провалы, потом предупреждения, и только те, что слышит владелец. */
export function worstFindings(audit, limit = 3, lang = 'en') {
  const open = (audit.checks || [])
    .filter((c) => c.status === 'fail' || c.status === 'warn')
    .sort((a, b) => {
      const s = (SEVERITY[a.status] ?? 2) - (SEVERITY[b.status] ?? 2);
      if (s) return s;
      // При равной тяжести вперёд идёт то, для чего есть фраза владельцу: она и попадёт в письмо.
      return (line(b.id, lang) ? 1 : 0) - (line(a.id, lang) ? 1 : 0);
    });
  return open.slice(0, limit).map((c) => ({
    id: c.id,
    status: c.status,
    label: c.label,
    value: c.value,
    say: line(c.id, lang) || `${c.label}: ${c.value}`,
    translated: Boolean(line(c.id, lang)),
  }));
}

/** Одна строка таблицы: сайт, оценка, находки и фраза для письма. */
export function prospectRow(audit, { name = '', lang = 'en' } = {}) {
  const findings = worstFindings(audit, 3, lang);
  // Фразу для письма ищем по всем открытым находкам, а не только по трём верхним: иначе в письмо
  // попадёт сырая техническая строка вроде «API catalogue (RFC 9727): not present», которую
  // владелец бизнеса не поймёт, хотя ниже лежала находка с человеческим объяснением.
  const all = worstFindings(audit, 99, lang).filter((f) => f.translated);
  const lead = [...all].sort((a, b) => {
    const ia = LEAD_ORDER.indexOf(a.id);
    const ib = LEAD_ORDER.indexOf(b.id);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  })[0] || findings[0] || null;
  return {
    host: audit.meta?.host || '',
    name: name || audit.client?.name || audit.meta?.host || '',
    score: overallScore(audit.scores),
    failing: (audit.checks || []).filter((c) => c.status === 'fail').length,
    warning: (audit.checks || []).filter((c) => c.status === 'warn').length,
    findings,
    say: lead ? lead.say : (lang === 'ru'
      ? 'Ничего заметного не нашлось: этот сайт в порядке, писать не о чем.'
      : 'Nothing worth writing about: this site is in order.'),
  };
}

/** Сортировка: сначала те, у кого хуже. Сайт без оценки уходит в конец, а не наверх. */
export function rank(rows) {
  return [...rows].sort((a, b) => {
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    if (a.score !== b.score) return a.score - b.score;
    return b.failing - a.failing;
  });
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows) {
  const head = ['site', 'name', 'score', 'failing', 'warnings', 'what to say'];
  return [head, ...rank(rows).map((r) => [r.host, r.name, r.score ?? '', r.failing, r.warning, r.say])]
    .map((line) => line.map(csvCell).join(','))
    .join('\n');
}

export function toMarkdown(rows, { title = 'Prospects, worst first' } = {}) {
  const ranked = rank(rows);
  const out = [`# ${title}`, '', `${ranked.length} site(s), the weakest at the top.`, '',
    '| # | Site | Score | Fails | What to say in the first line |', '|---:|---|---:|---:|---|'];
  ranked.forEach((r, i) => {
    out.push(`| ${i + 1} | ${r.host} | ${r.score ?? 'n/a'} | ${r.failing} | ${r.say.replace(/\|/g, '/')} |`);
  });
  out.push('', '## What each one has open', '');
  for (const r of ranked) {
    out.push(`### ${r.name} (${r.host})`);
    if (!r.findings.length) out.push('Nothing open that an owner would act on.');
    for (const f of r.findings) out.push(`- **${f.label}** (${f.status}): ${f.value}`);
    out.push('');
  }
  out.push('Every line above is a measured check, not an opinion. Open the site and confirm before you send anything.');
  return out.join('\n');
}
