/**
 * Пакет Foundation: работа с текстами, посчитанная по страницам, а не на глаз.
 *
 * Fix закрывает то, для чего не нужно знать бизнес клиента. Всё остальное, начала страниц,
 * источники цифр, разделы, таблицы и недостающие страницы, это Foundation. Цена такой работы
 * зависит от того, сколько страниц придётся тронуть и насколько глубоко, поэтому считать её
 * надо по выборке страниц, а не называть числом из головы.
 *
 * Единица счёта здесь одна: доля работы над одной страницей. Страница, которую надо написать
 * заново, стоит три доли, переработка двух и более дефектов две, одна правка одну. Итог это
 * сумма долей, умноженная на цену доли, но не ниже минимума пакета.
 *
 * Чего этот расчёт не знает: какие страницы приносят показы. Это видно только в Search Console,
 * доступ к которой даёт клиент, и это бесплатно. Без доступа мы считаем по выборке и говорим
 * об этом прямо, а не делаем вид, что выбрали важные страницы.
 *
 * Деньги в письмо по умолчанию не попадают. Объём работы машина считает честно, а цену называет
 * человек: короткая страница бывает короткой намеренно, и счёт, выставленный автоматом, окажется
 * счётом за работу, которой не нужно было делать. Цена включается флагом, осознанно.
 */

/**
 * Служебные страницы. Политику конфиденциальности не переписывают под ответ с цифрой, и таблица
 * в контактах никому не нужна. Счёт за такую работу это счёт за работу, которой не будет.
 */
// Слоги в двух алфавитах: русские сайты пишут те же страницы своими словами.
const UTILITY = /\/(privacy|privacy-policy|terms|terms-of-use|terms-and-conditions|cookie|cookies|refund|refunds|legal|disclaimer|imprint|contact|contacts|sitemap|search|404|thanks|thank-you|cart|checkout|wishlist|compare|my-account|tag|tags|author|category|feed|politika-konfidencialnosti|politika|konfidencialnost|usloviya|oferta|publichnaya-oferta|dogovor|vozvrat|vozvraty|kontakty|kontakt|spasibo|karta-sajta|poisk|pravila)(\/|$)/i;

export const isUtilityPage = (url) => { try { return UTILITY.test(new URL(url).pathname); } catch { return false; } };

/** Что не так с текстом страницы. Каждая строка это работа, а не наблюдение. */
const PAGE_ISSUES = [
  {
    id: 'thin',
    test: (p) => p.words < 300,
    ru: { what: 'страница пустая', action: 'написать заново по вашим фактам' },
    en: { what: 'the page is empty', action: 'write it from your facts' },
    heavy: true,
  },
  {
    id: 'answer-first',
    test: (p) => p.answerFirst === false,
    ru: { what: 'нет ответа в первом абзаце', action: 'переписать начало так, чтобы в первых 20 - 90 словах стоял ответ с цифрой' },
    en: { what: 'no answer in the opening paragraph', action: 'rewrite the opening so the first 20 to 90 words carry an answer with a figure' },
  },
  {
    id: 'sources',
    // Спрашиваем источники только там, где цифры вообще есть.
    test: (p) => (p.figureParagraphs || 0) > 0 && (p.sourcePhrases || 0) === 0 && (p.citedParagraphs || 0) === 0 && p.words >= 300,
    ru: { what: 'цифры без источников', action: 'подписать к каждой цифре, откуда она, словами или ссылкой рядом' },
    en: { what: 'figures with no sources', action: 'name where each figure comes from, in words or as a link beside it' },
  },
  {
    id: 'sections',
    test: (p) => (p.h2Count || 0) < 3 && p.words >= 300,
    ru: { what: 'нет разделов', action: 'разбить на разделы с заголовками, которые повторяют вопросы читателя' },
    en: { what: 'no sections', action: 'break it into sections whose headings repeat the reader\'s questions' },
  },
  {
    id: 'tables',
    test: (p) => (p.tables || 0) === 0 && p.words >= 600,
    ru: { what: 'нечего процитировать таблицей', action: 'собрать таблицу из ваших данных: её цитируют охотнее абзаца' },
    en: { what: 'nothing a table could quote', action: 'build a table from your data: tables get quoted more readily than prose' },
  },
];

/**
 * Доли работы. Пустую страницу пишем заново, это всегда три доли. Дальше по числу дефектов:
 * одна правка одна доля, две или три две, четыре и больше это по сути та же работа заново.
 */
const SHARES = { rewrite: 3, rework: 2, touch: 1 };
function tierOf(issues) {
  if (issues.some((i) => i.heavy)) return 'rewrite';
  if (issues.length >= 4) return 'rewrite';
  return issues.length > 1 ? 'rework' : 'touch';
}

const pick = (o, lang) => o[lang === 'en' ? 'en' : 'ru'];

/**
 * Смета по собранному аудиту.
 * @param {object} audit результат collect()
 * @param {{lang?: 'ru'|'en', unit?: number, minimum?: number, currency?: string, newPages?: number, hasSearchConsole?: boolean}} opts
 */
export function buildFoundationScope(audit, opts = {}) {
  const lang = opts.lang === 'en' ? 'en' : 'ru';
  const currency = opts.currency || (lang === 'en' ? 'USD' : 'RUB');
  const unit = Number(opts.unit ?? (lang === 'en' ? 50 : 4200));
  const minimum = Number(opts.minimum ?? (lang === 'en' ? 500 : 42000));
  const newPages = Math.max(0, Number(opts.newPages ?? 0));
  const withPrice = opts.withPrice === true;

  const sampled = (audit.sample || []).filter((p) => p.title !== undefined && typeof p.words === 'number');
  const utility = sampled.filter((p) => isUtilityPage(p.url));
  const content = sampled.filter((p) => !isUtilityPage(p.url));
  const pages = [];
  for (const p of content) {
    let issues = PAGE_ISSUES.filter((i) => i.test(p));
    // Странице, которую пишем заново, незачем отдельной строкой советовать переписать первый
    // абзац: это та же работа, названная дважды, и в списке она выглядит как две.
    if (issues.some((i) => i.heavy)) issues = issues.filter((i) => i.heavy);
    if (!issues.length) continue;
    const tier = tierOf(issues);
    pages.push({
      url: p.url,
      title: p.title,
      words: p.words,
      tier,
      shares: SHARES[tier],
      issues: issues.map((i) => ({ id: i.id, what: pick(i, lang).what, action: pick(i, lang).action })),
    });
  }
  pages.sort((a, b) => b.shares - a.shares || a.words - b.words);

  // Новая страница это всегда работа с нуля, то есть столько же, сколько переписывание пустой.
  const pageShares = pages.reduce((n, p) => n + p.shares, 0);
  const newShares = newPages * SHARES.rewrite;
  const shares = pageShares + newShares;
  const raw = shares * unit;
  const price = Math.max(minimum, raw);

  return {
    lang, currency, unit, minimum, newPages, withPrice,
    host: audit.meta?.host,
    checkedAt: audit.meta?.collectedAt,
    sampledPages: sampled.length,
    contentPages: content.length,
    utilityPages: utility.length,
    cleanPages: content.length - pages.length,
    pages, shares, pageShares, newShares, raw, price,
    atMinimum: price > raw,
    hasSearchConsole: Boolean(opts.hasSearchConsole),
  };
}

const T = {
  ru: {
    title: (h) => `# Работа с текстами на сайте ${h}`,
    checked: (d, n, u) => `Проверено ${d}. Смотрели ${n} ${plural(n, 'страницу', 'страницы', 'страниц')} из карты сайта${u ? `, не считая ${u} ${plural(u, 'служебной', 'служебных', 'служебных')}: политику, условия, контакты и подобные мы в работу не берём и в счёт не ставим` : ''}.`,
    none: '**Работы нет.** Ни на одной из просмотренных страниц мы не нашли того, что чинит Foundation. Предлагать вам этот пакет не за что.',
    found: (n, c) => `## Что нашли: ${n} ${plural(n, 'страница требует', 'страницы требуют', 'страниц требуют')} работы${c ? `, ещё ${c} в порядке` : ''}`,
    tier: { rewrite: 'написать заново', rework: 'переработать', touch: 'одна правка' },
    words: (n) => `${n} ${plural(n, 'слово', 'слова', 'слов')}`,
    newPages: (n, s) => `## Новые страницы: ${n}\n\nСтраниц, которых у вас нет, а рынок их спрашивает: ${n}. Каждая считается как страница с нуля, это ${s} ${plural(s, 'доля', 'доли', 'долей')}.`,
    workHead: '## Объём работы',
    workBody: (s) => `Всего ${s} ${plural(s, 'доля', 'доли', 'долей')} работы. Доля это работа над одной страницей: одна правка доля, две или три две доли, четыре и больше или пустая страница три. Цену мы назовём отдельно, когда вы согласуете сам список.`,
    thinWarn: 'Среди них есть страницы короче трёхсот слов. Если такие страницы у вас задуманы короткими, это анонсы, новости или ссылки на чужой материал, скажите, и мы уберём их из списка: писать их заново незачем.',
    priceHead: '## Цена',
    priceBody: (s, u, c, raw) => `Доля работы над одной страницей стоит ${u} ${c}. Долей набралось ${s}, это ${raw} ${c}.`,
    atMin: (min, c) => `Минимум пакета ${min} ${c}, поэтому в счёте будет ${min} ${c}: меньше этой суммы браться нет смысла ни нам, ни вам.`,
    total: (p, c) => `Итого ${p} ${c}.`,
    needHead: '## Что нужно от вас',
    needs: [
      'Факты: цифры, сроки, условия, которые мы поставим в начала страниц. Мы не выдумываем цифры за клиента.',
      'Источники этих цифр: ссылка, документ или ваш внутренний отчёт, на который можно сослаться словами.',
      'Доступ к сайту: репозиторий или редактор в вашей системе управления.',
    ],
    gscHead: 'Про Search Console',
    gscNo: 'Доступа к Search Console у нас нет, поэтому мы считали по выборке страниц из карты сайта, а не по тем, которые уже приносят показы. Если дадите доступ на чтение, это бесплатно и делается в два клика, мы пересчитаем смету по страницам, которые уже что-то собирают: обычно так работы становится меньше, а толку больше.',
    gscYes: 'Доступ к Search Console есть, поэтому в первую очередь мы берём страницы, которые уже собирают показы: правка такой страницы окупается быстрее, чем новая.',
    tail: 'Каждую строку этой сметы видно на самой странице, её можно проверить, открыв страницу глазами.',
  },
  en: {
    title: (h) => `# Text work on ${h}`,
    checked: (d, n, u) => `Checked ${d}. We looked at ${n} page${n === 1 ? '' : 's'} from the sitemap${u ? `, not counting ${u} utility page${u === 1 ? '' : 's'}: policies, terms, contact and the like are not work we take on or charge for` : ''}.`,
    none: '**There is no work here.** On none of the pages we looked at did we find what Foundation fixes. There is nothing to sell you.',
    found: (n, c) => `## What we found: ${n} page${n === 1 ? '' : 's'} ${n === 1 ? 'needs' : 'need'} work${c ? `, ${c} more ${c === 1 ? 'is' : 'are'} fine` : ''}`,
    tier: { rewrite: 'write from scratch', rework: 'rework', touch: 'one edit' },
    words: (n) => `${n} word${n === 1 ? '' : 's'}`,
    newPages: (n, s) => `## New pages: ${n}\n\nPages you do not have and the market asks for: ${n}. Each counts as a page written from scratch, ${s} share${s === 1 ? '' : 's'}.`,
    workHead: '## Scope of work',
    workBody: (s) => `${s} share${s === 1 ? '' : 's'} of work in total. A share is the work on one page: one edit is a share, two or three defects are two, four or more (or an empty page) three. We name the price separately, once you have agreed the list itself.`,
    thinWarn: 'Some of these are under 300 words. If those pages are meant to be short, link posts, news items, announcements, say so and we will drop them from the list: there is nothing to rewrite.',
    priceHead: '## Price',
    priceBody: (s, u, c, raw) => `One share of work on a page costs ${u} ${c}. The scope came to ${s} shares, which is ${raw} ${c}.`,
    atMin: (min, c) => `The package minimum is ${min} ${c}, so the invoice will say ${min} ${c}: below that it is not worth either side's time.`,
    total: (p, c) => `Total ${p} ${c}.`,
    needHead: '## What we need from you',
    needs: [
      'Facts: the figures, timings and terms we will put at the top of each page. We do not invent a client\'s numbers.',
      'Where those figures come from: a link, a document, or an internal report we can name in words.',
      'Access to the site: the repository, or an editor account in your CMS.',
    ],
    gscHead: 'About Search Console',
    gscNo: 'We have no Search Console access, so this is scoped on a sample of pages from the sitemap rather than on the pages that already earn impressions. Grant us read-only access, which is free and takes two clicks, and we will re-scope on the pages that already collect something: that usually means less work and more return.',
    gscYes: 'With Search Console access we start from the pages that already earn impressions: editing one of those pays back faster than a new page does.',
    tail: 'Every line of this scope is visible on the page itself; you can check it by opening the page and reading it.',
  },
};

const dict = (lang) => T[lang === 'en' ? 'en' : 'ru'];

/** Письмо клиенту: смета, которую он согласовывает до оплаты. */
export function renderFoundationScope(scope) {
  const t = dict(scope.lang);
  const L = [t.title(scope.host), '', t.checked(String(scope.checkedAt || '').slice(0, 10), scope.contentPages ?? scope.sampledPages, scope.utilityPages || 0), ''];
  if (!scope.pages.length && !scope.newPages) { L.push(t.none); return L.join('\n'); }

  if (scope.pages.length) {
    L.push(t.found(scope.pages.length, scope.cleanPages));
    L.push('');
    scope.pages.forEach((p, i) => {
      L.push(`${i + 1}. **${p.title}** (${t.words(p.words)}) — ${t.tier[p.tier]}, ${p.shares}`);
      L.push(`   ${p.url}`);
      for (const is of p.issues) L.push(`   - ${is.what}: ${is.action}`);
    });
    L.push('');
  }
  if (scope.newPages) { L.push(t.newPages(scope.newPages, scope.newShares)); L.push(''); }

  if (scope.withPrice) {
    L.push(t.priceHead);
    L.push('');
    L.push(t.priceBody(scope.shares, scope.unit, scope.currency, scope.raw));
    if (scope.atMinimum) L.push(t.atMin(scope.minimum, scope.currency));
    L.push(t.total(scope.price, scope.currency));
  } else {
    L.push(t.workHead);
    L.push('');
    L.push(t.workBody(scope.shares));
  }
  if (scope.pages.some((p) => p.issues.some((i) => i.id === 'thin'))) { L.push(''); L.push(t.thinWarn); }
  L.push('');
  L.push(t.needHead);
  L.push('');
  for (const n of t.needs) L.push(`- ${n}`);
  L.push('');
  L.push(`### ${t.gscHead}`);
  L.push('');
  L.push(scope.hasSearchConsole ? t.gscYes : t.gscNo);
  L.push('');
  L.push(t.tail);
  return L.join('\n');
}

/** Чек-лист исполнителю: страницы по убыванию работы. */
export function renderFoundationChecklist(scope) {
  const t = dict(scope.lang);
  const L = [`# ${scope.lang === 'en' ? 'Foundation checklist' : 'Чек-лист Foundation'}: ${scope.host}`, '',
    `${scope.lang === 'en' ? 'Shares' : 'Долей'}: ${scope.shares} (${scope.pageShares} + ${scope.newShares} ${scope.lang === 'en' ? 'new' : 'новых'}).${scope.withPrice ? ` ${scope.lang === 'en' ? 'Price' : 'Цена'}: ${scope.price} ${scope.currency}.` : ''}`, ''];
  for (const p of scope.pages) {
    L.push(`- [ ] ${p.title} (${t.tier[p.tier]}, ${p.shares})`);
    L.push(`      ${p.url}`);
    for (const is of p.issues) L.push(`      - [ ] ${is.id}: ${is.action}`);
  }
  if (scope.newPages) L.push(`- [ ] ${scope.lang === 'en' ? 'New pages' : 'Новые страницы'}: ${scope.newPages} × ${SHARES.rewrite}`);
  return L.join('\n');
}

function plural(n, one, few, many) {
  const d = n % 10; const dd = n % 100;
  return d === 1 && dd !== 11 ? one : d >= 2 && d <= 4 && (dd < 10 || dd >= 20) ? few : many;
}
