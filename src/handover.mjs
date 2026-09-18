/**
 * Готовые файлы, а не советы.
 *
 * Простым языком. Аудит находит, что нет карты для агентов, что разметка неполная, что заголовок
 * обрезается в выдаче. Написать «сделайте llms.txt» легко, и это ровно то, за что покупатель
 * платить не должен. Здесь из уже прочитанных данных собираются файлы, которые человек кладёт к
 * себе: карта для агентов, разметка организации и починенные заголовки.
 *
 * Главное правило: **ничего не выдумывать про чужой бизнес**. Всё, что здесь появляется, взято
 * с его же страниц. Чего в данных нет, то остаётся помеченным пропуском с подписью, что туда
 * вписать, а не догадкой. Придуманный ИНН или придуманный год основания в разметке это ложь,
 * которую потом прочитают и поисковик, и ИИ.
 */

const trim = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const space = cut.lastIndexOf(' ');
  return `${(space > n * 0.6 ? cut.slice(0, space) : cut).replace(/[\s.,;:·|–—-]+$/, '')}…`;
};

/**
 * Описание, которое обрывается на многоточии, выглядит как недоделка, а не как готовое поле.
 * Поэтому режем по концу предложения, если оно есть во второй половине лимита, иначе по слову,
 * и никакого хвоста с точками.
 */
const sentenceTrim = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  // Набираем целые предложения, пока влезают. Так поле кончается точкой, а не на полуслове.
  let out = '';
  for (const part of t.split(/(?<=[.!?])\s+/)) {
    const next = out ? `${out} ${part}` : part;
    if (next.length > n) break;
    out = next;
  }
  if (out) return out;
  const cut = t.slice(0, n);
  const space = cut.lastIndexOf(' ');
  return `${(space > n * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:–—-]+$/, '')}…`;
};

/** Служебные страницы заголовком клики не зарабатывают, и чинить их длину незачем. */
const SERVICE_PATH = /\/(privacy|privacy-policy|terms|terms-of-use|legal|cookie|cookies|disclaimer|sitemap|404|thank-you|thanks|spasibo|politika|oferta|soglashenie)/i;

const pathOf = (u) => { try { return new URL(u).pathname; } catch { return String(u || ''); } };

/** Первый сегмент адреса: по нему страницы группируются в разделы карты. */
const sectionOf = (u) => {
  const p = pathOf(u).replace(/^\/+|\/+$/g, '');
  if (!p) return '';
  return p.split('/')[0];
};

/**
 * Как называется компания.
 *
 * Заголовок главной почти всегда собран из двух частей, но бренд стоит то в конце («Станки · ШопРу»),
 * то в начале («MORE Group: агентство на Пхукете»). Отличает их длина: название это одно-три слова,
 * а не фраза. Поэтому берём хвост, если он короткий, иначе начало, если короткое оно. Если коротким
 * не оказалось ничего, названия мы не знаем: ставим домен и просим проверить, а не выдаём фразу со
 * страницы за имя организации.
 */
const WORDS_IN_NAME = 3;
function brandOf(audit) {
  const host = audit?.meta?.host || '';
  const pages = (audit?.sample || []).filter((p) => p.title !== undefined);
  const raw = String(pages[0]?.title || '').replace(/\s+/g, ' ').trim();
  const parts = raw.split(/\s*[·|—–:]\s*|\s+-\s+/).map((x) => x.trim()).filter(Boolean);
  if (parts.length > 1) {
    const words = (x) => x.split(/\s+/).length;
    const last = parts[parts.length - 1];
    const first = parts[0];
    if (words(last) <= WORDS_IN_NAME) return { name: trim(last, 60), sure: true };
    if (words(first) <= WORDS_IN_NAME) return { name: trim(first, 60), sure: true };
  }
  return { name: host, sure: false };
}

const WORDS = {
  en: {
    other: 'Other pages',
    home: 'Start here',
    placeholder: (what) => `TODO: ${what}`,
    titlePattern: 'Assembled from the page H1 and the site name so it fits the limit.',
    descPattern: 'Assembled from the first paragraph of the page so it fits the limit.',
    noDesc: 'the page has no meta description at all',
    tooLong: (n) => `${n} characters: cut in results`,
    tooShort: (n) => `${n} characters: the words that earn the click are missing`,
  },
  ru: {
    other: 'Другие страницы',
    home: 'Начните отсюда',
    placeholder: (what) => `ВПИСАТЬ: ${what}`,
    titlePattern: 'Собран из H1 страницы и названия сайта так, чтобы уложиться в лимит.',
    descPattern: 'Собрано из первого абзаца страницы так, чтобы уложиться в лимит.',
    noDesc: 'описания у страницы нет вовсе',
    tooLong: (n) => `${n} знаков: в выдаче обрежется`,
    tooShort: (n) => `${n} знаков: не хватает слов, ради которых кликают`,
  },
};

/**
 * Карта для агентов. Формат llms.txt: заголовок с названием сайта, абзац о нём, затем разделы
 * списками ссылок с однострочным пояснением у каждой.
 *
 * Пояснение берётся из описания страницы, а если его нет, из её первого абзаца. Выдумывать
 * пояснение нечем и незачем: пустая строка честнее придуманной.
 */
export function buildLlmsTxt(audit, { lang = 'en', maxLinks = 60 } = {}) {
  const w = WORDS[lang === 'ru' ? 'ru' : 'en'];
  const host = audit?.meta?.host || '';
  const pages = (audit?.sample || []).filter((p) => p.title !== undefined && p.url);
  const home = pages[0] || {};
  const name = brandOf(audit).name || host;
  const about = sentenceTrim(home.description || home.firstPara || '', 200);

  const bySection = new Map();
  for (const p of pages.slice(0, maxLinks)) {
    const key = sectionOf(p.url);
    if (!bySection.has(key)) bySection.set(key, []);
    bySection.get(key).push(p);
  }

  const lines = [`# ${name}`, ''];
  lines.push(about ? `> ${about}` : `> ${w.placeholder(lang === 'ru' ? 'одно предложение о том, чем занимается сайт' : 'one sentence on what this site is')}`);
  lines.push('');

  const sections = [...bySection.entries()].sort((a, b) => (a[0] === '' ? -1 : b[0] === '' ? 1 : a[0].localeCompare(b[0])));
  for (const [key, list] of sections) {
    lines.push(`## ${key === '' ? w.home : key}`);
    lines.push('');
    for (const p of list) {
      const note = sentenceTrim(p.description || p.firstPara || '', 140);
      lines.push(`- [${trim(p.title, 95)}](${p.url})${note ? `: ${note}` : ''}`);
    }
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

/**
 * Разметка организации из того, что сайт уже сам про себя говорит.
 *
 * Возвращает и сам блок, и список того, чего в данных не нашлось: телефон, почта, адрес. Эти поля
 * в блок не попадают, а уезжают отдельным списком «впишите сами». Так покупатель видит, что
 * пропуск это пропуск, а не наша забывчивость.
 */
export function buildOrganisationSchema(audit, { lang = 'en' } = {}) {
  const host = audit?.meta?.host || '';
  const site = audit?.meta?.site || (host ? `https://${host}/` : '');
  const pages = (audit?.sample || []).filter((p) => p.title !== undefined);
  const home = pages[0] || {};
  const brand = brandOf(audit);
  const name = brand.name || host;
  const description = sentenceTrim(home.description || home.firstPara || '', 200);
  const profiles = (audit?.entity?.profiles || []).map((h) => (/^https?:\/\//i.test(h) ? h : `https://${h}`));

  const json = { '@context': 'https://schema.org', '@type': 'Organization', name, url: site };
  if (description) json.description = description;
  if (profiles.length) json.sameAs = profiles;

  const missing = [];
  const need = lang === 'ru'
    ? { telephone: 'телефон', email: 'почта', address: 'адрес', logo: 'адрес картинки с логотипом' }
    : { telephone: 'a telephone', email: 'an email', address: 'a postal address', logo: 'the URL of your logo image' };
  if (!profiles.length) missing.push({ field: 'sameAs', what: lang === 'ru' ? 'адреса ваших профилей: инстаграм, ютуб, линкедин, карточка на картах' : 'the URLs of your own profiles: Instagram, YouTube, LinkedIn, your maps listing' });
  if (!audit?.entity?.telephone) missing.push({ field: 'telephone', what: need.telephone });
  if (!audit?.entity?.email) missing.push({ field: 'email', what: need.email });
  missing.push({ field: 'address', what: need.address });
  missing.push({ field: 'logo', what: need.logo });
  if (!description) missing.push({ field: 'description', what: lang === 'ru' ? 'одно предложение о компании' : 'one sentence about the company' });
  // Названия в заголовке главной не было, поэтому в разметке стоит домен: это надо проверить глазами.
  if (!brand.sure) missing.push({ field: 'name', what: lang === 'ru' ? `проверьте название: в разметке стоит «${name}», взято из домена` : `check the name: the markup says “${name}”, taken from the domain` });

  return { json, missing, text: JSON.stringify(json, null, 2) };
}

/**
 * Починенные заголовки и описания.
 *
 * Это не копирайтинг, и называть его так нельзя. Настоящий заголовок требует знать, чем человек
 * торгует и как это ищут, а мы этого не знаем. Что здесь делается: заголовок собирается из
 * СОБСТВЕННОГО H1 страницы и названия сайта так, чтобы уложиться в лимит и не обрезаться в
 * выдаче, описание из первого абзаца той же страницы. Рядом всегда написано, что там сейчас и
 * почему это плохо, чтобы покупатель видел, что чинится длина и структура, а не смысл.
 */
export function fixTitlesAndDescriptions(audit, { lang = 'en', limit = 6 } = {}) {
  const w = WORDS[lang === 'ru' ? 'ru' : 'en'];
  const pages = (audit?.sample || []).filter((p) => p.title !== undefined && p.url);
  const brand = trim(brandOf(audit).name, 24);

  const broken = [];
  for (const p of pages) {
    if (SERVICE_PATH.test(pathOf(p.url))) continue;
    const title = String(p.title || '');
    const desc = String(p.description || '');
    /*
     * Пороги те же, что у проверок аудита: заголовок 40-60 знаков, описание 70-160. Свои числа
     * здесь означали бы, что отчёт называет страницу нормальной, а список правок её же чинит.
     */
    const titleBad = !title.length ? (lang === 'ru' ? 'заголовка нет' : 'no title')
      : title.length > 60 ? w.tooLong(title.length)
      : title.length < 40 ? w.tooShort(title.length) : '';
    const descBad = !desc.length ? w.noDesc : desc.length > 160 ? w.tooLong(desc.length) : desc.length < 70 ? w.tooShort(desc.length) : '';
    if (!titleBad && !descBad) continue;

    const item = { url: p.url, path: pathOf(p.url) };
    if (titleBad) {
      /*
       * Заголовок собирается только из того, что на странице уже есть, и проверяется тем же
       * порогом, что и в самом аудите: 40-60 знаков. Три попытки по очереди. H1 плюс бренд.
       * Нынешний заголовок без бренда, если он просто длинный. H1 сам по себе. Что не уложилось
       * целиком, то не предлагается: заголовок с многоточием в выдаче это не починка.
       */
      const h1 = String(p.h1 || '').replace(/\s+/g, ' ').trim();
      const withoutBrand = brand ? title.split(/\s*[·|—–]\s*/).filter((x) => x.trim() && x.trim() !== brand).join(' · ').trim() : '';
      const fits = (x) => x && !x.includes('\u2026') && x.length >= 40 && x.length <= 60;
      const suggestion = [h1 && brand ? `${h1} · ${brand}` : '', withoutBrand, h1].find(fits) || '';
      if (suggestion && suggestion !== title) item.title = { now: title, problem: titleBad, suggestion, how: w.titlePattern };
    }
    if (descBad) {
      const source = p.firstPara || desc;
      const suggestion = source ? sentenceTrim(source, 155) : '';
      const better = suggestion.length >= 70 && suggestion.length <= 160 && suggestion !== desc;
      if (better) item.description = { now: desc, problem: descBad, suggestion, how: w.descPattern };
    }
    if (!item.title && !item.description) continue;
    broken.push(item);
    if (broken.length >= limit) break;
  }
  return broken;
}
