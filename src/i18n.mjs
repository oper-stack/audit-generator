/**
 * Перевод собранных проверок на русский.
 *
 * Отдельный слой поверх сборщика: логика проверок не трогается вообще, поэтому перевод не может
 * сломать ни одну оценку. Каждая запись знает идентификатор проверки и умеет пересобрать её текст
 * по числам, которые уже посчитаны. Если для проверки записи нет, она остаётся как есть, и тест
 * это показывает, а не прячет.
 *
 *   import { localiseChecks } from '@operstack/audit/i18n'
 *   audit.checks = localiseChecks(audit.checks, 'ru')
 */

/** Достаёт все целые и дробные числа из строки по порядку. */
const nums = (s) => (String(s).match(/\d+(?:[.,]\d+)?/g) || []).map((x) => x.replace(',', '.'));
/** Склонение: 1 страница, 2 страницы, 5 страниц. */
const plural = (n, one, few, many) => {
  const d = Math.abs(n) % 10; const dd = Math.abs(n) % 100;
  return `${n} ${d === 1 && dd !== 11 ? one : d >= 2 && d <= 4 && (dd < 10 || dd >= 20) ? few : many}`;
};
/** Проценты по-русски склоняются: 31 процент, 32 процента, 35 процентов. */
const pct = (n) => plural(Number(n), 'процент', 'процента', 'процентов');
const pages = (n) => plural(Number(n), 'страница', 'страницы', 'страниц');
const pagesOf = (a, b) => `${a} из ${pages(b)}`;

/** Перевод «сколько проверок пройдено» из подписи под оценкой. */
export function localiseBasisNote(note) {
  const m = String(note || '').match(/^(\d+) of (\d+) checks pass(?:, (\d+) needs? attention)?(?:, (\d+) fails?)?$/);
  if (!m) {
    if (/^not measured/.test(String(note || ''))) return String(note).replace(/^not measured:\s*/, 'не измерялось: ');
    return note;
  }
  const [, ok, total, warn, bad] = m;
  const parts = [`${ok} из ${plural(Number(total), 'проверки', 'проверок', 'проверок')} пройдено`];
  if (warn) parts.push(plural(Number(warn), 'спорная', 'спорные', 'спорных'));
  if (bad) parts.push(plural(Number(bad), 'провалена', 'провалены', 'провалено'));
  return parts.join(', ');
}

/**
 * Записи перевода. value и comment получают исходный английский текст и возвращают русский,
 * пересобирая его из тех же чисел. Там, где текст постоянный, возвращается константа.
 */
const RU = {
  https: { label: 'HTTPS', value: (v) => (/certificate active/.test(v) ? 'сертификат активен' : 'сайт отдаётся по http, без шифрования') },
  www: {
    label: 'Склейка адреса с www',
    value: (v) => (/redirects to/.test(v) ? 'адрес с www перенаправляется на основной'
      : /does not resolve/.test(v) ? 'адрес с www не существует'
        : `адрес с www отвечает ${nums(v)[0] || ''} и не перенаправляет`),
  },
  ttfb: { label: 'Время до первого байта', value: (v) => `${nums(v)[0]} мс`, comment: () => 'один запрос от проверяющего, а не лабораторный тест' },
  robots: {
    label: 'robots.txt',
    value: (v) => { const n = nums(v); return /HTTP/.test(v) ? `не отдаётся, код ${n[0]}` : `${plural(Number(n[0]), 'запрещающее правило', 'запрещающих правила', 'запрещающих правил')} в ${plural(Number(n[1]), 'блоке', 'блоках', 'блоках')} агентов, ${plural(Number(n[2]), 'строка', 'строки', 'строк')} с картой сайта`; },
    comment: (c) => (/no Sitemap/.test(c) ? 'нет строки Sitemap' : ''),
  },
  'robots-block': { label: 'robots.txt закрывает весь сайт', value: () => 'Disallow: / под User-agent: *', comment: () => 'поисковым системам сказано не обходить ничего' },
  'ai-search-access': {
    label: 'Доступ поисковых роботов ИИ',
    value: (v) => (/every AI search fetcher/.test(v) ? 'все поисковые роботы ИИ могут читать сайт' : `закрыто: ${v.replace(/^\d+ blocked: /, '')}`),
    comment: (c) => (c ? 'именно эти роботы достают страницу, чтобы процитировать её в ответе' : ''),
  },
  'robots-ai': {
    label: 'Обучающие краулеры закрыты (решение владельца)',
    value: (v) => `${plural(Number(nums(v)[0]), 'агент закрыт', 'агента закрыты', 'агентов закрыто')} полностью: ${v.split(': ').slice(1).join(': ')}`,
    comment: () => 'это выбор владельца, а не дефект: эти системы не будут учиться на сайте и не процитируют его из собственного обхода',
  },
  sitemap: {
    label: 'Карта сайта XML',
    value: (v) => (/URL\(s\) in/.test(v) ? `${plural(Number(nums(v)[0]), 'адрес', 'адреса', 'адресов')} в карте сайта` : /not found|missing/i.test(v) ? 'не найдена' : `не отдаётся, код ${nums(v)[0]}`),
  },
  'sitemap-foreign': { label: 'В карте сайта чужие хосты', value: (v) => `${plural(Number(nums(v)[0]), 'адрес', 'адреса', 'адресов')} на других хостах` },
  'sitemap-health': { label: 'Адреса из карты сайта отвечают 200', value: (v) => { const n = nums(v); return `${n[0]} из ${n[1]} проверенных адресов отвечают 200${/redirect/.test(v) ? `, ${n[2]} перенаправляют` : ''}${/broken/.test(v) ? ', есть битые' : ''}`; } },
  llms: {
    label: 'llms.txt',
    value: (v) => (/not present/.test(v) ? 'нет'
      : /HTML page/.test(v) ? 'отдаёт HTML-страницу вместо текстового индекса'
        : `${plural(Number(nums(v)[0]), 'ссылка', 'ссылки', 'ссылок')}, ${nums(v)[1]} на другие хосты`),
    comment: (c) => (/nothing to read/.test(c) ? 'ответным системам нечего читать, генерация индекса это работа на день' : c ? 'система ИИ может принять сайт за чужой' : ''),
  },
  title: { label: 'Заголовок главной', value: (v) => { const n = nums(v); return `${plural(Number(n[n.length - 1]), 'знак', 'знака', 'знаков')}${Number(n[n.length - 1]) > 60 ? ', в выдаче обрежется' : ', укладывается в выдачу'}`; } },
  description: { label: 'Описание главной', value: (v) => (/missing|none/i.test(v) ? 'нет' : /shortcode|garbage/i.test(v) ? 'содержит служебный код вместо текста' : `${plural(Number(nums(v)[0]), 'знак', 'знака', 'знаков')}`) },
  h1: { label: 'Заголовок H1 на главной', value: (v) => `${plural(Number(nums(v)[0] || 0), 'заголовок', 'заголовка', 'заголовков')} H1` },
  canonical: { label: 'Канонический адрес', value: (v) => (/missing|none/i.test(v) ? 'не указан' : 'указан') },
  viewport: { label: 'Мобильный viewport', value: (v) => (/missing/.test(v) ? 'не задан' : v), comment: (c) => (c ? 'запрещает масштабирование: плохо для доступности и мобильного поиска' : '') },
  og: { label: 'Карточки для соцсетей', value: (v) => (/none/.test(v) ? 'нет' : v) },
  schema: { label: 'Разметка на главной', value: (v) => (/no JSON-LD/.test(v) ? 'разметки нет' : /invalid/.test(v) ? 'разметка есть, но с ошибкой' : v) },
  'faq-schema': { label: 'Разметка вопросов FAQPage', value: (v) => (/not found/.test(v) ? 'не найдена в выборке' : `есть на ${pages(nums(v)[0])} выборки`) },
  'org-schema': { label: 'Разметка организации', value: (v) => (/not found/.test(v) ? 'не найдена: ответным системам не к чему привязать сайт' : 'есть') },
  resources: { label: 'Вес главной страницы', value: (v) => { const n = nums(v); return `${plural(Number(n[0]), 'файл скриптов', 'файла скриптов', 'файлов скриптов')}, ${plural(Number(n[1]), 'стиль', 'стиля', 'стилей')}, ${plural(Number(n[2]), 'изображение', 'изображения', 'изображений')}`; } },
  hreflang: { label: 'hreflang', value: (v) => (/none/.test(v) ? 'нет, сайт одноязычный' : `${plural(Number(nums(v)[0]), 'альтернатива', 'альтернативы', 'альтернатив')}`) },
  cms: { label: 'Движок сайта', value: (v) => v },
  xmlrpc: { label: 'xmlrpc.php', value: (v) => `отвечает ${nums(v)[0]}`, comment: () => 'открытая точка для атак, пользы для поиска никакой' },
  alt: { label: 'Подписи к картинкам', value: (v) => { const n = nums(v); return `${n[0]} из ${n[1]} картинок имеют подпись, это ${pct(n[2])}, на ${pages(n[3])} выборки`; } },
  'h1-sample': { label: 'Структура заголовков', value: (v) => (/one H1 per page/.test(v) ? 'по одному H1 на страницу' : `${nums(v)[0]} из ${pages(nums(v)[1])} имеют больше одного H1`) },
  'dup-titles': { label: 'Повторы заголовков', value: (v) => (/its own title/.test(v) ? 'у каждой проверенной страницы свой заголовок' : `${plural(Number(nums(v)[0]), 'заголовок повторяется', 'заголовка повторяются', 'заголовков повторяются')} на разных страницах`) },
  thin: { label: 'Тонкие страницы', value: (v) => (/median/.test(v) ? `медиана ${plural(Number(nums(v)[0]), 'слово', 'слова', 'слов')} на страницу` : `${nums(v)[0]} из ${pages(nums(v)[1])} короче 300 слов`) },
  utility: { label: 'Служебные страницы в карте сайта', value: (v) => `${plural(Number(nums(v)[0]), 'адрес', 'адреса', 'адресов')}, например ${v.split('such as ')[1] || ''}`, comment: () => 'корзина, избранное, теги и страницы авторов засоряют индекс' },
  'answer-first': {
    label: 'Ответ в первом абзаце',
    value: (v) => { const n = nums(v); return `${n[0]} из ${pages(n[1])} выборки начинаются с 20-90 слов, где есть цифра, сразу после H1`; },
    comment: (c) => (c ? 'именно этот абзац ответная система забирает в цитату' : ''),
  },
  sections: { label: 'Разбивка на разделы', value: (v) => { const n = nums(v); return `${n[0]} из ${pages(n[1])} выборки имеют три и более подзаголовка H2`; }, comment: (c) => (c ? 'системы цитируют разделы, а не сплошной текст' : '') },
  tables: { label: 'Таблицы в тексте', value: (v) => (/no table/.test(v) ? 'на проверенных страницах таблиц нет' : `${nums(v)[0]} из ${pages(nums(v)[1])} выборки используют таблицу`), comment: (c) => (c ? 'таблица это второй по частоте формат цитирования после первого абзаца' : '') },
  sources: { label: 'Названные источники цифр', value: (v) => { const n = nums(v); return `${n[0]} из ${pages(n[1])} выборки называют, откуда взята цифра, словами или ссылкой рядом с ней`; }, comment: (c) => (c ? 'цифра без источника это первое, что система выбрасывает' : '') },
  dates: { label: 'Открытые даты публикации', value: (v) => (/no article dates/.test(v) ? 'дат в выборке нет: ответные системы не поймут, что здесь актуально' : `${nums(v)[0]} из ${pages(nums(v)[1])} выборки показывают дату`) },
  'links-profile': { label: 'Профиль внешних ссылок (необязательное дополнение)', value: (v) => { const n = nums(v); return `${plural(Number(n[0]), 'ссылающийся домен', 'ссылающихся домена', 'ссылающихся доменов')}, ${plural(Number(n[1]), 'ссылка', 'ссылки', 'ссылок')}, ${pct(n[2])} передают вес, показатель авторитета ${n[3]} из 100`; }, comment: (c) => `${c.split('.')[0]}. Платный инструмент, для этого отчёта не обязателен и ни в одну оценку не входит.` },
  'trust-entity': { label: 'Кто это, в машиночитаемом виде', value: (v) => (/no postal address/.test(v) ? 'почтового адреса в разметке нет' : 'почтовый адрес опубликован в разметке'), comment: (c) => (c ? 'рейтинговые системы и ответные движки по нему отличают одну компанию от другой' : '') },
  'trust-contact': {
    label: 'Прямые контакты',
    value: (v) => (/no phone, email or messenger/.test(v) ? 'ни телефона, ни почты, ни мессенджера не опубликовано'
      : v.replace(/\bphone\b/g, 'телефон').replace(/\bemail\b/g, 'почта').replace(/a messenger/g, 'мессенджер').replace(/ and /g, ' и ')),
  },
  'trust-profiles': { label: 'Профили на других площадках', value: (v) => (/no sameAs/.test(v) ? 'в разметке не заявлено ни одного профиля на других площадках' : `${nums(v)[0]}: ${v.split(': ').slice(1).join(': ')}`), comment: (c) => (c ? 'самый дешёвый внешний сигнал, и он бесплатный' : '') },
  'trust-about': { label: 'Страница о компании', value: (v) => (/no about/.test(v) ? 'страницы о компании нет или на неё не ведут ссылки' : 'на неё ведут ссылки с проверенных страниц') },
  'trust-policies': { label: 'Политика и условия', value: (v) => (/neither/.test(v) ? 'ни политики конфиденциальности, ни условий на сайте нет' : `есть: ${v.replace(/privacy/g, 'политика').replace(/terms/g, 'условия').replace(/legal/g, 'правовая страница').replace(/cookie/g, 'куки').replace(/disclaimer/g, 'оговорка')}`) },
  'conv-contact-path': { label: 'Способ связаться', value: (v) => { const n = nums(v); return `${n[0]} из ${pages(n[1])} выборки дают форму, контактную ссылку или страницу контактов`; } },
  'conv-cta': { label: 'Призыв к действию в первом экране', value: (v) => { const n = nums(v); return `${n[0]} из ${pages(n[1])} выборки ставят его в первых ${n[2]} процентах страницы`; }, comment: (c) => (c ? 'читателю, которого убедили сверху, не должно приходиться искать' : '') },
  'conv-form-depth': { label: 'На какой глубине лежит форма', value: (v) => (/no form/.test(v) ? 'на проверенных страницах формы нет' : /could not be measured/.test(v) ? 'положение формы измерить не удалось' : `медиана ${pct(nums(v)[0])} вниз по странице, измерено на ${pages(nums(v)[1])}`), comment: (c) => (c ? 'на длинной странице дотуда почти никто не доходит, особенно с телефона' : '') },
  'conv-form-fields': { label: 'Сколько полей просит форма', value: (v) => `медиана ${plural(Number(nums(v)[0]), 'поле', 'поля', 'полей')} до отправки`, comment: (c) => (c ? 'каждое лишнее поле стоит ответов, а телефон дороже всех' : '') },
  'conv-messenger': { label: 'Ссылка на мессенджер', value: (v) => (/none/.test(v) ? 'на проверенных страницах нет' : `на ${nums(v)[0]} из ${pages(nums(v)[1])} выборки`), comment: (c) => (c ? 'для международной аудитории с телефона одна ссылка на мессенджер обычно ценнее формы' : '') },
};

/** Проверки, для которых перевода нет. Пусто означает, что покрыто всё. */
export function untranslated(checks) {
  return [...new Set((checks || []).map((c) => c.id).filter((id) => !RU[id]))];
}

/**
 * Возвращает копию списка проверок с русскими названиями и текстами.
 * Проверка без записи возвращается как есть: молча английский текст не прячем.
 */
export function localiseChecks(checks, lang = 'ru') {
  if (lang !== 'ru') return checks;
  return (checks || []).map((c) => {
    const r = RU[c.id];
    if (!r) return c;
    const out = { ...c, label: r.label || c.label };
    try { if (r.value) out.value = r.value(c.value ?? ''); } catch { /* оставляем исходный текст */ }
    try { if (r.comment) out.comment = r.comment(c.comment ?? ''); } catch { /* оставляем исходный текст */ }
    return out;
  });
}

/** Русские названия шести областей. */
export const AREAS_RU = {
  'SEO, technical': 'SEO, техническая часть',
  'SEO, content and structure': 'SEO, контент и структура',
  'AEO, answers and snippets': 'AEO, ответы и сниппеты',
  'GEO, visibility in AI systems': 'GEO, видимость в системах ИИ',
  'Off-page and trust': 'Ссылки и доверие',
  'Conversion and UX': 'Конверсия и удобство',
};
