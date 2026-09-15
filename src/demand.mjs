/**
 * Карта спроса: что люди в нише спрашивают на самом деле и под что у сайта нет страницы.
 *
 * Простым языком. Аудит отвечает на вопрос «почему не идут заявки», и половина ответа почти
 * всегда одна: люди спрашивают не то, о чём написан сайт. Эта карта показывает три вещи.
 * Какие запросы задают в нише: их даёт бесплатное автодополнение Яндекса и Google, то есть
 * это фразы, которые люди уже набирали. Сколько раз в месяц их задают: частоты из Topvisor,
 * нашего платного инструмента. И есть ли на сайте страница под каждый запрос: сопоставление
 * по словам адреса и заголовка, оценка, а не чтение смысла, и так и подписано.
 *
 * Правило от 11 сентября: платные данные не входят ни в один балл. Карта спроса это пометка
 * к отчёту, а не оценка, и рядом всегда написано, где покупатель проверит те же числа сам и
 * бесплатно: Wordstat Яндекса и Планировщик ключевых слов Google, со своим аккаунтом.
 *
 * Ни одного числа, которого нет в источнике: запрос без частоты так и подписывается словами.
 * Ни одного лишнего рубля: цена спрашивается до запуска и пишется в результат.
 */
import { parse } from 'node-html-parser';

const UA = 'Mozilla/5.0 (compatible; OperStack demand map; +https://oper-stack.com)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

export const DEMAND_DEFAULTS = { max: 200, delayMs: 150, pollMs: 15000, timeoutMs: 20 * 60000, seedsMax: 12, sitemapMax: 3000 };
export const DEMAND_PROJECT = 'OperStack: карта спроса';

/** Регионы, с которыми мы работаем: ключ Topvisor (он же id геобазы Яндекса) и страна для подсказок Google. */
export const REGIONS = {
  225: { ru: 'Россия', en: 'Russia', gl: 'ru', engine: 'yandex' },
  213: { ru: 'Москва', en: 'Moscow', gl: 'ru', engine: 'yandex' },
  2: { ru: 'Санкт-Петербург', en: 'Saint Petersburg', gl: 'ru', engine: 'yandex' },
  84: { ru: 'США', en: 'United States', gl: 'us', engine: 'google' },
  102: { ru: 'Великобритания', en: 'United Kingdom', gl: 'gb', engine: 'google' },
  95: { ru: 'Канада', en: 'Canada', gl: 'ca', engine: 'google' },
  211: { ru: 'Австралия', en: 'Australia', gl: 'au', engine: 'google' },
  96: { ru: 'Германия', en: 'Germany', gl: 'de', engine: 'google' },
  210: { ru: 'ОАЭ', en: 'United Arab Emirates', gl: 'ae', engine: 'google' },
  246: { ru: 'Греция', en: 'Greece', gl: 'gr', engine: 'google' },
  983: { ru: 'Турция', en: 'Turkey', gl: 'tr', engine: 'google' },
  994: { ru: 'Индия', en: 'India', gl: 'in', engine: 'google' },
  995: { ru: 'Таиланд', en: 'Thailand', gl: 'th', engine: 'google' },
  10620: { ru: 'Бангкок', en: 'Bangkok', gl: 'th', engine: 'google' },
};

/** Шаблоны, которыми зерно превращается в вопросы. Порядок важен: сначала само зерно. */
export const PATTERNS = {
  ru: ['{q}', 'как {q}', 'сколько стоит {q}', 'где {q}', '{q} цена', '{q} отзывы', 'что такое {q}', '{q} или'],
  en: ['{q}', 'how to {q}', '{q} cost', 'best {q}', 'what is {q}', '{q} price', '{q} near me', '{q} vs'],
};

// Служебные слова не участвуют в сопоставлении: «как купить квартиру в сочи» и страница
// «купить квартиру в Сочи» это одна тема, слово «как» темы не меняет.
const STOP = {
  ru: new Set('и в во на с со к ко по о об от до из за для при не что как это или а но у же ли бы то еще сколько стоит где цена отзывы такое лучшие лучший какой какая какие чем про без купить продажа продать заказать стоимость'.split(' ')),
  en: new Set('the a an and or of to in on for with at by from is are be it this that vs near me how what best cost price which who why when where do does can should my your buy purchase sale'.split(' ')),
};

// Адреса русских сайтов почти всегда в латинице (/kvartiry-v-sochi/), а запросы в кириллице.
// Чтобы «квартиры в сочи» нашли свою страницу, слова приводятся к одной латинской основе:
// транслитерация, схлопывание вариантов написания (kh и h, ts и c, y и i), первые пять букв.
const TRANSLIT = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const canon = (w) => {
  const latin = [...w].map((ch) => (TRANSLIT[ch] !== undefined ? TRANSLIT[ch] : ch)).join('');
  const same = latin.replace(/shch/g, 'sch').replace(/kh/g, 'h').replace(/ts/g, 'c').replace(/[yj]/g, 'i').replace(/'/g, '');
  return same.length > 5 ? same.slice(0, 5) : same;
};

/** Слова, по которым запрос сравнивается со страницей: без служебных, приведённые к одной основе. */
export function tokens(s, lang = 'en') {
  return [...new Set(String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9\s-]/g, ' ').split(/[\s-]+/)
    .filter((w) => w.length >= 3 && !STOP.ru.has(w) && !STOP.en.has(w))
    .map(canon))];
}

const SPLIT_TITLE = /\s[|·•–—-]\s|:|\||\.\s|\?|!/;
const GENERIC = /^(главная|главная страница|home|home page|homepage|контакты|contact us|contacts|about us|о нас|о компании|blog|блог|news|новости|privacy policy|политика конфиденциальности)$/;
// Призывы, мессенджеры и служебные пункты меню: это не темы ниши, а кнопки.
const JUNK = /получит|подобрать|подборк|заказать|заказ|скачать|записаться|оставить|заявк|позвонить|написать|консультац|whatsapp|telegram|viber|vpn|\bmax\b|войти|вход|регистрац|login|sign in|sign up|contact|download|get a |book a |request|subscribe|подписаться|cookie|политика/i;
const TAIL_STOP = new Set('в во на с со к ко по о об от до из за для при и или а но у the a an and or of to in on for with at by from'.split(' '));

/**
 * Зёрна: о чём сайт, по его же заголовкам. Слова бренда вырезаются, иначе подсказки
 * будут про название компании, а не про нишу. Фраза режется перед первым числом («новые
 * проекты на Пхукете от 4,6 млн» становится «новые проекты на Пхукете»), потому что цена
 * и срок это не тема, а хвостовой предлог после обрезки отбрасывается.
 */
function brandWordsOf(pages, host, brand) {
  const brandWords = new Set([
    ...String(host || '').replace(/^www\./, '').split('.')[0].toLowerCase().split('-').filter((w) => w.length >= 3),
    ...clean(brand).toLowerCase().split(/[\s|:]+/).filter((w) => w.length >= 2),
  ]);
  // Сегмент заголовка, который повторяется на нескольких страницах, это тоже бренд.
  const segCount = new Map();
  for (const p of pages || []) for (const seg of clean(p.title).toLowerCase().split(SPLIT_TITLE)) { const k = clean(seg); if (k) segCount.set(k, (segCount.get(k) || 0) + 1); }
  for (const [seg, n] of segCount) if (n >= 2 && (pages || []).length >= 2) for (const w of seg.split(' ')) brandWords.add(w);
  return brandWords;
}

/**
 * Якоря: слова темы сайта из H1 и заголовков страниц, без бренда. Запрос без якоря в карту
 * не попадает: автодополнение охотно уводит «инвестиции в недвижимость» в Дубай, а сайт про
 * Камбоджу. Лучше меньше запросов, но все про этот сайт.
 */
export function anchorsFromPages(pages, { host = '', brand = '', lang = 'en' } = {}) {
  const brandWords = brandWordsOf(pages, host, brand);
  const brandTok = new Set([...brandWords].flatMap((w) => tokens(w, lang)));
  const out = new Set();
  for (const p of pages || []) for (const raw of [p.h1, p.title]) for (const words of segments(raw, brandWords)) {
    for (const t of tokens(words.join(' '), lang)) if (!brandTok.has(t) && !UNITS.has(t)) out.add(t);
  }
  // Слова из имени домена это чаще ниша, чем бренд: invest-cambodia, florida-estate, greek-invest.
  // Заголовок такого сайта может быть лозунгом без географии, и без этих слов якорей не остаётся.
  // Склеенное имя без дефисов (moregroupestate, globalyachtguide) словом не является.
  for (const w of String(host || '').replace(/^www\./, '').split('.')[0].toLowerCase().split('-')) {
    if (w.length >= 4 && w.length <= 10 && !HOST_GENERIC.has(w)) for (const t of tokens(w, lang)) out.add(t);
  }
  return out;
}
const HOST_GENERIC = new Set(['www', 'shop', 'online', 'site', 'web', 'group', 'best', 'top', 'official', 'company', 'estate', 'invest', 'agency', 'media', 'blog', 'news']);

// Единицы и сроки из заголовков («от 4,6 млн ₽», «за 2 часа») темы не задают.
const UNITS = new Set(['mln', 'tys', 'rub', 'usd', 'eur', 'chas', 'chasa', 'chaso', 'minut', 'dnei', 'dnia', 'nedel', 'mesia', 'goda', 'let', 'hour', 'hours', 'days', 'weeks', 'month', 'years', 'min', 'max']);

/** Сегменты заголовка словами: разделители, обрезка перед первым числом, хвостовой предлог и бренд долой. */
function segments(raw, brandWords) {
  const out = [];
  for (const part of clean(raw).split(SPLIT_TITLE)) {
    let words = clean(part).toLowerCase().replace(/[«»"()]/g, '').split(' ').filter(Boolean);
    const firstDigit = words.findIndex((w) => /\d/.test(w));
    if (firstDigit === 0) continue;
    if (firstDigit > 0) words = words.slice(0, firstDigit);
    while (words.length && TAIL_STOP.has(words[words.length - 1])) words.pop();
    words = words.filter((w) => !brandWords.has(w) && /[a-zа-яё]/i.test(w));
    if (words.length) out.push(words);
  }
  return out;
}

export function seedsFromPages(pages, { host = '', brand = '', lang = 'en', max = DEMAND_DEFAULTS.seedsMax } = {}) {
  const brandWords = brandWordsOf(pages, host, brand);
  const anchors = anchorsFromPages(pages, { host, brand, lang });
  const seen = new Set(); const out = [];
  const consider = (raw, anchored) => {
    for (const words of segments(raw, brandWords)) {
      const s = words.join(' ');
      if (words.length < 2 || words.length > 7 || GENERIC.test(s) || JUNK.test(s) || seen.has(s)) continue;
      const tok = tokens(s, lang);
      if (tok.length < 2) continue;
      // Подзаголовки и меню годятся в зёрна, только если держатся за тему: «гибкие планы
      // оплаты» и «что изменилось» это лозунги, а не то, что люди ищут.
      if (anchored && !tok.some((t) => anchors.has(t))) continue;
      seen.add(s); out.push(s);
    }
  };
  // Сначала H1 и заголовки страниц: это темы. Меню в конце: там чаще кнопки, чем темы.
  for (const p of pages || []) consider(p.h1, false);
  for (const p of pages || []) consider(p.title, false);
  for (const p of pages || []) for (const h of p.h2 || []) consider(h, true);
  for (const p of pages || []) for (const n of p.nav || []) consider(n, true);
  return out.slice(0, max);
}

async function defaultFetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,application/xml,text/plain,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}
async function defaultFetchJson(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return JSON.parse(await res.text());
}

/** Главная как страница для зёрен: заголовок, H1, подзаголовки H2, пункты меню и бренд из og:site_name. */
export async function homePage(url, { fetchText = defaultFetchText } = {}) {
  const root = parse(await fetchText(url));
  const text = (el) => clean(el ? el.text : '');
  return {
    url, title: text(root.querySelector('title')), h1: text(root.querySelector('h1')),
    h2: root.querySelectorAll('h2').map(text).slice(0, 12),
    nav: root.querySelectorAll('nav a, header a').map(text).filter((t) => t.split(' ').length >= 2).slice(0, 30),
    brand: root.querySelector('meta[property="og:site_name"]')?.getAttribute('content') || '',
  };
}

/** Зёрна с самой главной. */
export async function seedsFromSite(url, { fetchText = defaultFetchText, host, max, lang } = {}) {
  const page = await homePage(url, { fetchText });
  return seedsFromPages([page], { host: host || new URL(url).host, brand: page.brand, max, lang });
}

/** Одна подсказка: что автодополнение предлагает на эту фразу. Оба ответа имеют вид [фраза, [варианты]]. */
export async function suggest(q, { engine = 'google', lang = 'en', gl = 'us', lr = 225, fetchJson = defaultFetchJson } = {}) {
  const url = engine === 'yandex'
    ? `https://suggest.yandex.ru/suggest-ff.cgi?part=${encodeURIComponent(q)}&lr=${lr}`
    : `https://suggestqueries.google.com/complete/search?client=firefox&hl=${lang}&gl=${gl}&q=${encodeURIComponent(q)}`;
  const body = await fetchJson(url);
  const list = Array.isArray(body) && Array.isArray(body[1]) ? body[1] : [];
  return list.map((x) => (Array.isArray(x) ? x[0] : x)).map(clean).filter(Boolean);
}

/**
 * Из зёрен в запросы. Каждое зерно прогоняется через шаблоны и подсказки; остаются фразы
 * из двух и более слов, у которых есть общее слово с зерном (иначе автодополнение уводит
 * в сторону). Квота делится поровну между зёрнами: ниша шире одного заголовка.
 */
export async function expandQueries(seeds, { lang = 'en', region = 84, max = DEMAND_DEFAULTS.max, delayMs = DEMAND_DEFAULTS.delayMs, fetchJson, engines, anchors = null } = {}) {
  const ru = lang === 'ru';
  const gl = REGIONS[region]?.gl || (ru ? 'ru' : 'us');
  const use = engines || (ru ? ['yandex', 'google'] : ['google']);
  const perSeed = new Map(); let calls = 0; let failed = 0;
  for (const seed of seeds) {
    const bag = new Set();
    const seedTok = tokens(seed, lang);
    const anchorSet = anchors && anchors.size !== undefined ? anchors : (anchors ? new Set(anchors) : null);
    const add = (s) => {
      const n = clean(s).toLowerCase();
      if (!n || bag.has(n) || n.split(' ').length < 2) return;
      const tok = tokens(n, lang);
      if (!tok.some((t) => seedTok.includes(t))) return;
      if (anchorSet && anchorSet.size && !tok.some((t) => anchorSet.has(t))) return;
      bag.add(n);
    };
    add(seed);
    for (const tpl of PATTERNS[ru ? 'ru' : 'en']) {
      const q = tpl.replace('{q}', seed);
      for (const engine of use) {
        calls += 1;
        try { for (const s of await suggest(q, { engine, lang: ru ? 'ru' : 'en', gl, lr: region, fetchJson })) add(s); } catch { failed += 1; }
        if (delayMs) await sleep(delayMs);
      }
    }
    perSeed.set(seed, [...bag]);
  }
  const out = []; const seen = new Set();
  for (let i = 0, more = true; more && out.length < max; i++) {
    more = false;
    for (const list of perSeed.values()) {
      if (i >= list.length) continue;
      more = true;
      if (!seen.has(list[i])) { seen.add(list[i]); out.push(list[i]); }
      if (out.length >= max) break;
    }
  }
  return { queries: out, calls, failed, engines: use, perSeed: Object.fromEntries([...perSeed].map(([k, v]) => [k, v.length])) };
}

/** Клиент Topvisor: JSON-вызов и импорт ключей формой. Без ключей возвращает null. */
export function topvisorClient({ userId = process.env.TOPVISOR_USER_ID, key = process.env.TOPVISOR_KEY, base = 'https://api.topvisor.com/v2/json/', fetchFn = globalThis.fetch } = {}) {
  if (!userId || !key) return null;
  const headers = { 'User-Id': String(userId).trim(), Authorization: `bearer ${String(key).trim()}` };
  const unwrap = async (res, method) => {
    const body = await res.json().catch(() => ({}));
    if (body.errors && body.errors.length) throw new Error(`Topvisor ${method}: ${body.errors.map((e) => e.string || e.code).join('; ')}`);
    return body.result;
  };
  return {
    async call(method, body = {}) {
      const res = await fetchFn(base + method, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
      return unwrap(res, method);
    },
    async importKeywords(projectId, groupId, keywords) {
      const boundary = `----operstack${Date.now()}`;
      const part = (name, value) => `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
      const body = part('project_id', projectId) + part('group_id', groupId) + part('keywords', keywords.join('\n')) + `--${boundary}--\r\n`;
      const res = await fetchFn(`${base}add/keywords_2/keywords/import`, { method: 'POST', headers: { ...headers, 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body, signal: AbortSignal.timeout(120000) });
      return unwrap(res, 'add/keywords_2/keywords/import');
    },
  };
}

/**
 * Частоты через Topvisor. Проект один на все карты, группа на каждый прогон. Порядок:
 * проект, поисковик и регион в нём, группа, импорт, цена, запуск, опрос до заполнения.
 * `dry` останавливается после цены: видно, сколько это стоит, и ничего не списано.
 */
export async function volumesViaTopvisor(queries, { lang = 'en', region = 84, engine, type, client, projectName = DEMAND_PROJECT, groupName, dry = false, pollMs = DEMAND_DEFAULTS.pollMs, timeoutMs = DEMAND_DEFAULTS.timeoutMs, log = () => {}, now = Date.now } = {}) {
  const eng = engine || REGIONS[region]?.engine || (lang === 'ru' ? 'yandex' : 'google');
  const searcher = eng === 'yandex' ? 0 : 1;
  const vtype = type || (eng === 'yandex' ? 1 : 3);
  const field = `volume:${region}:${searcher}:${vtype}`;
  const result = { source: 'Topvisor', engine: eng, region: Number(region), type: vtype, price: null, currency: 'RUB', asked: queries.length, filled: 0, volumes: {}, projectId: null, groupId: null, launched: false, note: '' };
  if (!client) { result.source = 'none'; result.note = 'no credentials'; return result; }
  if (!queries.length) { result.note = 'no queries'; return result; }

  const list = async () => (await client.call('get/projects_2/projects', { fields: ['id', 'name'], limit: 1000 })) || [];
  let project = (await list()).find((p) => p.name === projectName);
  if (!project) { await client.call('add/projects_2/projects', { url: 'oper-stack.com', name: projectName }); project = (await list()).find((p) => p.name === projectName); }
  if (!project) throw new Error('Topvisor: проект для карты спроса не создался');
  result.projectId = project.id;

  // Поисковик и регион в проекте: без них частоты не запускаются. «Уже есть» не ошибка.
  const soft = async (method, body) => { try { await client.call(method, body); } catch (e) { if (!/уже|already|exist|существ/i.test(e.message)) log(`  ${e.message}`); } };
  await soft('add/positions_2/searchers', { project_id: project.id, searcher_key: searcher });
  await soft('add/positions_2/searchers/regions', { project_id: project.id, searcher_key: searcher, region_key: Number(region), region_lang: lang === 'ru' ? 'ru' : 'en', region_device: 0, region_depth: 1 });
  const [prj] = (await client.call('get/projects_2/projects', { fields: ['id'], show_searchers_and_regions: 1, filters: [{ name: 'id', operator: 'EQUALS', values: [project.id] }] })) || [];
  const haveRegion = (prj?.searchers || []).some((s) => Number(s.key) === searcher && (s.regions || []).some((r) => Number(r.key) === Number(region)));
  if (!haveRegion) throw new Error(`Topvisor: регион ${region} для поисковика ${eng} не добавился в проект`);

  const gname = groupName || `${new Date().toISOString().slice(0, 10)} ${region}`;
  await client.call('add/keywords_2/groups', { project_id: project.id, name: [gname] }).catch(() => client.call('add/keywords_2/groups', { project_id: project.id, names: [gname] }));
  const groups = (await client.call('get/keywords_2/groups', { project_id: project.id, fields: ['id', 'name'], limit: 1000 })) || [];
  const group = [...groups].reverse().find((g) => g.name === gname);
  if (!group) throw new Error('Topvisor: группа не создалась');
  result.groupId = group.id;
  await client.importKeywords(project.id, group.id, queries);

  const filters = [{ name: 'group_id', operator: 'EQUALS', values: [group.id] }];
  const q = { project_id: project.id, qualifiers: [{ region_key: Number(region), searcher_key: searcher, type: vtype }], target_type: 'keywords', filters };
  const priceRes = await client.call('get/keywords_2/volumes/price', q);
  const p = priceRes && priceRes.pricesByUsers ? Object.values(priceRes.pricesByUsers)[0] : null;
  result.price = p && Number.isFinite(Number(p.price)) ? Number(p.price) : null;
  log(`  Topvisor: ${queries.length} запросов, ${eng}, регион ${region}, цена ${result.price === null ? 'неизвестна' : `${result.price} ₽`}`);
  if (dry) { result.note = 'dry run: not launched'; return result; }

  await client.call('edit/keywords_2/volumes/go', q);
  result.launched = true;
  const started = now();
  for (;;) {
    const rows = (await client.call('get/keywords_2/keywords', { project_id: project.id, fields: ['name', field], filters, limit: 10000 })) || [];
    const vols = {}; let filled = 0;
    for (const r of rows) { const v = r[field]; if (v !== null && v !== undefined && v !== '') { vols[clean(r.name).toLowerCase()] = Number(v); filled += 1; } }
    result.volumes = vols; result.filled = filled;
    if (rows.length && filled >= rows.length) break;
    if (now() - started > timeoutMs) { result.note = `timeout: ${filled} of ${rows.length}`; break; }
    await sleep(pollMs);
  }
  return result;
}

/** Все адреса из карт сайта, чтобы было с чем сопоставлять запросы. Только адреса: заголовков у нас нет. */
export async function sitemapPages(url, { fetchText = defaultFetchText, max = DEMAND_DEFAULTS.sitemapMax } = {}) {
  const origin = new URL(url).origin;
  const robots = await fetchText(`${origin}/robots.txt`).catch(() => '');
  const listed = [...robots.matchAll(/^sitemap:\s*(\S+)/gim)].map((m) => m[1]);
  const queue = listed.length ? listed : [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];
  const urls = new Set(); const seen = new Set(); let files = 0;
  while (queue.length && urls.size < max && files < 30) {
    const u = queue.shift();
    if (seen.has(u)) continue;
    seen.add(u); files += 1;
    const xml = await fetchText(u).catch(() => '');
    if (!xml) continue;
    const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
    if (/<sitemapindex/i.test(xml)) queue.push(...locs);
    else for (const l of locs) { if (urls.size >= max) break; urls.add(l); }
  }
  return [...urls].map((u) => ({ url: u, title: '', h1: '' }));
}

/**
 * Заголовки для адресов из карты сайта. Адреса русских сайтов часто английские (/districts/),
 * а запросы русские, и по одному адресу «районы пхукета» свою страницу не найдут. Заголовок
 * страницы написан на языке сайта, поэтому дочитываем его для первых `max` адресов, начиная
 * с коротких: разделы важнее глубоких карточек. Страница не ответила, значит остаётся адрес.
 */
export async function enrichTitles(pages, { fetchText = defaultFetchText, max = 120, concurrency = 4 } = {}) {
  const depth = (u) => { try { return new URL(u).pathname.split('/').filter(Boolean).length; } catch { return 99; } };
  const todo = (pages || []).filter((p) => p && p.url && !p.title && !p.h1).sort((a, b) => depth(a.url) - depth(b.url) || a.url.length - b.url.length).slice(0, Math.max(0, max));
  let i = 0; let done = 0;
  const worker = async () => {
    while (i < todo.length) {
      const p = todo[i++];
      try {
        const root = parse(await fetchText(p.url));
        p.title = clean(root.querySelector('title')?.text); p.h1 = clean(root.querySelector('h1')?.text);
        if (p.title || p.h1) done += 1;
      } catch { /* остаётся адрес */ }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return done;
}

const pageTokens = (p, lang) => {
  let path = '';
  try { path = decodeURIComponent(new URL(p.url).pathname); } catch { path = String(p.url || ''); }
  return new Set(tokens(`${path.replace(/[/_.]+/g, ' ')} ${p.title || ''} ${p.h1 || ''}`, lang));
};

/** Есть ли под запрос страница: все значимые слова запроса встречаются в адресе или заголовке одной страницы. */
export function coverage(queries, pages, { lang = 'en' } = {}) {
  const index = (pages || []).filter((p) => p && p.url).map((p) => ({ url: p.url, tok: pageTokens(p, lang) }));
  return queries.map((q) => {
    const qt = tokens(q, lang);
    if (!qt.length) return { q, covered: false, url: null };
    const hit = index.find((p) => qt.every((t) => p.tok.has(t)));
    return { q, covered: Boolean(hit), url: hit ? hit.url : null };
  });
}

export function demandTotals(queries) {
  const known = queries.filter((q) => q.volume !== null && q.volume !== undefined);
  const sum = (l) => l.reduce((a, q) => a + (Number(q.volume) || 0), 0);
  return {
    queries: queries.length, withVolume: known.length,
    covered: queries.filter((q) => q.covered).length, uncovered: queries.filter((q) => !q.covered).length,
    volumeTotal: sum(known), volumeCovered: sum(known.filter((q) => q.covered)), volumeUncovered: sum(known.filter((q) => !q.covered)),
  };
}

/**
 * Вся карта одним вызовом. Страницы можно передать из audit.json (`sample`), тогда зёрна
 * берутся из их заголовков; иначе читается главная. Адреса для сопоставления всегда
 * дочитываются из карт сайта.
 */
export async function buildDemandMap(url, opts = {}) {
  const { lang = 'en', region: regionIn, seeds: seedsIn, pages: pagesIn, max, dry = false, volumes = true, client = topvisorClient(), fetchText = defaultFetchText, fetchJson = defaultFetchJson, log = () => {}, engines, delayMs, pollMs, timeoutMs, groupName, now, titles = 120, brand = '' } = opts;
  const region = Number(regionIn) || (lang === 'ru' ? 225 : 84);
  const host = new URL(url).host.replace(/^www\./, '');
  log(`карта спроса: ${host}, язык ${lang}, регион ${region} (${REGIONS[region]?.[lang] || region})`);
  const pages = pagesIn && pagesIn.length ? pagesIn : [await homePage(url, { fetchText })];
  const brandName = brand || pages.find((p) => p.brand)?.brand || '';
  const seeds = seedsIn && seedsIn.length ? seedsIn.map(clean).filter(Boolean) : seedsFromPages(pages, { host, brand: brandName, lang });
  const anchors = anchorsFromPages(pages, { host, brand: brandName, lang });
  for (const sd of seedsIn || []) for (const t of tokens(sd, lang)) anchors.add(t);
  log(`  зёрна (${seeds.length}): ${seeds.join('; ')}`);
  log(`  якорные слова темы (${anchors.size}): ${[...anchors].join(', ')}`);
  const exp = await expandQueries(seeds, { lang, region, max, fetchJson, engines, anchors, delayMs: delayMs ?? DEMAND_DEFAULTS.delayMs });
  log(`  запросов: ${exp.queries.length} из ${exp.calls} обращений к подсказкам, не ответили ${exp.failed}`);
  const fromSitemap = await sitemapPages(url, { fetchText }).catch(() => []);
  const known = new Set((pagesIn || []).map((p) => p.url));
  const extra = fromSitemap.filter((p) => !known.has(p.url));
  const titled = titles ? await enrichTitles(extra, { fetchText, max: titles }) : 0;
  log(`  страниц для сопоставления: ${(pagesIn || []).length + extra.length}, заголовков дочитано ${titled}`);
  const sitePages = [...(pagesIn || []), ...extra];
  const cov = coverage(exp.queries, sitePages, { lang });
  let vol = { source: 'none', engine: null, type: null, volumes: {}, price: null, currency: 'RUB', filled: 0, asked: exp.queries.length, note: volumes ? 'no credentials' : 'volumes off', projectId: null, groupId: null };
  if (volumes && exp.queries.length) vol = await volumesViaTopvisor(exp.queries, { lang, region, client, dry, log, pollMs, timeoutMs, now, groupName: groupName || `${host} ${new Date().toISOString().slice(0, 10)}` });
  const queries = cov.map((c) => ({ q: c.q, volume: vol.volumes[c.q.toLowerCase()] ?? null, covered: c.covered, url: c.url }))
    .sort((a, b) => ((b.volume ?? -1) - (a.volume ?? -1)) || a.q.localeCompare(b.q));
  return {
    host, url, lang: lang === 'ru' ? 'ru' : 'en', region, regionName: REGIONS[region]?.[lang === 'ru' ? 'ru' : 'en'] || String(region), collectedAt: new Date().toISOString(),
    seeds, anchors: [...anchors], discovery: { calls: exp.calls, failed: exp.failed, engines: exp.engines }, pagesIndexed: sitePages.length, titlesRead: titled,
    volumes: { source: vol.source, engine: vol.engine, type: vol.type, price: vol.price, currency: vol.currency || 'RUB', filled: vol.filled, asked: vol.asked, note: vol.note || '', projectId: vol.projectId, groupId: vol.groupId },
    queries, totals: demandTotals(queries),
  };
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n, lang) => Number(n).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US');
const pathOf = (u) => { try { const x = new URL(u); return x.pathname + x.search; } catch { return String(u || ''); } };

const COPY = {
  ru: {
    title: 'Карта спроса', eyebrow: 'Спрос',
    lead: (d) => `Что люди в этой нише спрашивают на самом деле и есть ли у сайта страница под каждый вопрос. Запросы взяты из подсказок ${d.discovery?.engines?.includes('yandex') ? 'Яндекса и Google' : 'Google'}: это фразы, которые люди уже набирали. ${d.volumes.source === 'Topvisor' ? `Частота это сколько раз в месяц запрос задают в регионе «${d.regionName}», по данным Topvisor.` : 'Частоты для этой карты не собирались, поэтому доли считаются по числу запросов.'} Столбец «Страница» показывает, нашлась ли на сайте страница, в адресе или заголовке которой есть все слова запроса: это оценка по словам, а не чтение смысла.`,
    cells: { queries: 'Запросов', covered: 'Есть страница', uncovered: 'Нет страницы', share: 'Спрос без страницы' },
    verdict: (t) => (t.volumeTotal > 0
      ? `Под ${t.uncovered} запросов из ${t.queries} у сайта нет страницы. По частотам это ${Math.round(t.volumeUncovered / t.volumeTotal * 100)} % спроса ниши (${fmt(t.volumeUncovered, 'ru')} из ${fmt(t.volumeTotal, 'ru')} запросов в месяц), который сейчас проходит мимо сайта.`
      : `Под ${t.uncovered} запросов из ${t.queries} у сайта нет страницы: ${t.queries ? Math.round(t.uncovered / t.queries * 100) : 0} % найденных вопросов ниши.`),
    cols: { q: 'Запрос', v: 'В месяц', p: 'Страница' }, noVolume: 'нет данных', noPage: 'нет',
    more: (n) => `Ещё ${n} запросов в приложении к отчёту (файл карты спроса).`,
    empty: 'Подсказки не дали ни одного запроса по заголовкам этого сайта. Так бывает у сайтов без содержательных заголовков: сначала нужны страницы с темами, потом карта.',
    source: (d) => `Откуда числа. Запросы: автодополнение ${d.discovery?.engines?.includes('yandex') ? 'Яндекса и Google' : 'Google'}, бесплатно, без аккаунта. ${d.volumes.source === 'Topvisor' ? 'Частоты: Topvisor, платный инструмент OperStack; в баллы отчёта они не входят. ' : ''}Проверить самому и бесплатно: Яндекс Wordstat (wordstat.yandex.ru) и Планировщик ключевых слов Google Ads, со своим бесплатным аккаунтом. Числа там могут отличаться на округление и дату сбора.`,
  },
  en: {
    title: 'Demand map', eyebrow: 'Demand',
    lead: (d) => `What people in this niche actually ask, and whether the site has a page for each question. The queries come from ${d.discovery?.engines?.includes('yandex') ? 'Yandex and Google' : 'Google'} autocomplete: phrases people have already typed. ${d.volumes.source === 'Topvisor' ? `Volume is how many times a month the query is searched in ${d.regionName}, according to Topvisor.` : 'Volumes were not collected for this map, so the shares are counted by number of queries.'} The "Page" column says whether a page on the site carries every word of the query in its address or title: a word match, not a reading of meaning.`,
    cells: { queries: 'Queries', covered: 'Has a page', uncovered: 'No page', share: 'Demand without a page' },
    verdict: (t) => (t.volumeTotal > 0
      ? `${t.uncovered} of ${t.queries} queries have no page on the site. By volume that is ${Math.round(t.volumeUncovered / t.volumeTotal * 100)}% of the niche's demand (${fmt(t.volumeUncovered, 'en')} of ${fmt(t.volumeTotal, 'en')} searches a month) passing the site by.`
      : `${t.uncovered} of ${t.queries} queries have no page on the site: ${t.queries ? Math.round(t.uncovered / t.queries * 100) : 0}% of the questions found in the niche.`),
    cols: { q: 'Query', v: 'A month', p: 'Page' }, noVolume: 'no data', noPage: 'none',
    more: (n) => `${n} more queries in the report appendix (the demand map file).`,
    empty: 'Autocomplete returned no queries for this site\'s headings. That happens on sites without descriptive headings: pages with topics come first, the map after.',
    source: (d) => `Where the numbers come from. Queries: ${d.discovery?.engines?.includes('yandex') ? 'Yandex and Google' : 'Google'} autocomplete, free, no account. ${d.volumes.source === 'Topvisor' ? 'Volumes: Topvisor, a paid tool OperStack pays for; they count towards no score in this report. ' : ''}Check it yourself for free: Yandex Wordstat (wordstat.yandex.ru) and the Google Ads Keyword Planner, with your own free account. Their figures may differ by rounding and by the date of collection.`,
  },
};

/** Тело раздела для отчёта: цифры, вывод, таблица, откуда данные. Обёртку страницы даёт отчёт. */
export function renderDemandHtml(d, { lang = d.lang, limit = 40 } = {}) {
  const L = COPY[lang === 'ru' ? 'ru' : 'en'];
  const t = d.totals || demandTotals(d.queries || []);
  if (!t.queries) return `<p>${esc(L.lead(d))}</p><p>${esc(L.empty)}</p><p class="scorecard-foot">${esc(L.source(d))}</p>`;
  const share = t.volumeTotal > 0 ? `${Math.round(t.volumeUncovered / t.volumeTotal * 100)} %` : `${Math.round(t.uncovered / t.queries * 100)} %`;
  const cells = [[L.cells.queries, t.queries], [L.cells.covered, t.covered], [L.cells.uncovered, t.uncovered], [L.cells.share, share]]
    .map(([k, v]) => `<div class="kpi"><div class="kpi-value">${esc(v)}</div><div class="kpi-label">${esc(k)}</div></div>`).join('');
  const rows = (d.queries || []).slice(0, limit).map((q) => `<tr><td>${esc(q.q)}</td><td class="num">${q.volume === null || q.volume === undefined ? esc(L.noVolume) : fmt(q.volume, lang)}</td><td>${q.covered ? esc(pathOf(q.url)) : `<span class="status-bad">${esc(L.noPage)}</span>`}</td></tr>`).join('');
  const rest = Math.max(0, (d.queries || []).length - limit);
  return `<p>${esc(L.lead(d))}</p><div class="kpis">${cells}</div><div class="verdict"><p><strong>${esc(L.verdict(t))}</strong></p></div><table><tr><th>${esc(L.cols.q)}</th><th class="num">${esc(L.cols.v)}</th><th>${esc(L.cols.p)}</th></tr>${rows}</table>${rest ? `<p class="scorecard-foot">${esc(L.more(rest))}</p>` : ''}<p class="scorecard-foot">${esc(L.source(d))}</p>`;
}

/** Та же карта текстом: для файла рядом с отчётом и для письма. */
export function renderDemandMarkdown(d, { lang = d.lang, limit = 200 } = {}) {
  const L = COPY[lang === 'ru' ? 'ru' : 'en'];
  const t = d.totals || demandTotals(d.queries || []);
  const head = [`# ${L.title}: ${d.host}`, '', L.lead(d), ''];
  if (!t.queries) return [...head, L.empty, '', L.source(d)].join('\n');
  const table = [`| ${L.cols.q} | ${L.cols.v} | ${L.cols.p} |`, '|---|---:|---|', ...(d.queries || []).slice(0, limit).map((q) => `| ${q.q} | ${q.volume === null || q.volume === undefined ? L.noVolume : fmt(q.volume, lang)} | ${q.covered ? pathOf(q.url) : L.noPage} |`)];
  return [...head, `**${L.verdict(t)}**`, '', ...table, '', L.source(d)].join('\n');
}

/** Строка для таблицы источников отчёта: карта спроса названа платной и не входящей в балл. */
export function demandSourceRow(d, lang = d.lang) {
  const ru = lang === 'ru';
  if (d.volumes?.source === 'Topvisor') {
    return { name: ru ? 'Topvisor (частоты для карты спроса)' : 'Topvisor (volumes for the demand map)', access: ru ? 'Платный инструмент, в баллы не входит' : 'Paid tool, counts towards no score', detail: ru ? `частоты ${d.totals?.withVolume ?? 0} запросов в регионе «${d.regionName}»; сами запросы из бесплатных подсказок` : `volumes for ${d.totals?.withVolume ?? 0} queries in ${d.regionName}; the queries themselves come from free autocomplete` };
  }
  return { name: ru ? 'Подсказки поиска (карта спроса)' : 'Search autocomplete (demand map)', access: ru ? 'Бесплатно, без аккаунта' : 'Free, no account needed', detail: ru ? `${d.totals?.queries ?? 0} запросов; частоты не собирались` : `${d.totals?.queries ?? 0} queries; no volumes collected` };
}

export function demandCsv(d) {
  const line = (a) => a.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',');
  return [line(['query', 'volume', 'has_page', 'url']), ...(d.queries || []).map((q) => line([q.q, q.volume ?? '', q.covered ? 1 : 0, q.url || '']))].join('\n');
}
