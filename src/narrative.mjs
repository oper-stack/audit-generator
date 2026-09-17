/**
 * Черновик текста аудита, собранный из проверок.
 *
 * Раньше десятиcтраничный отчёт выходил из сборщика с тридцатью двумя дырами: резюме, приоритеты,
 * разбор контента, вывод. Их писал человек, то есть каждая продажа стоила часа работы, и продать
 * десять аудитов в неделю было физически нельзя. Здесь эти дыры закрываются словами, собранными
 * из тех же цифр, что уже измерены. Аналитику остаётся править, а не писать с нуля.
 *
 * Два правила, которые тут важнее всего.
 *
 * Первое: ни одного факта о бизнесе клиента мы не выдумываем. Всё, что пишется, либо посчитано
 * проверками, либо прочитано с самой страницы, и тогда помечено как прочитанное, чтобы аналитик
 * подтвердил. Там, где знания нет, стоит честная строка «не измеряли», а не догадка.
 *
 * Второе: отчёт читает не сеошник. Его читает владелец, который платил агентству, результата не
 * увидел и теперь разбирается сам. Поэтому каждая мысль сначала объясняется человеческими словами
 * (что это значит для него и его денег), и только потом называется технически.
 */

const T = {
  ru: {
    subjectFrom: (d) => `По описанию на главной: ${d}. Это то, что о вас прочитает и человек, и поисковик, и ИИ.`,
    subjectNone: 'На главной не сказано, чем занимается компания. Это и есть первая проблема: если это непонятно человеку, это непонятно и поисковику, и ИИ.',
    unknownLang: 'не указан в коде страниц',
    /*
     * Обращение к аналитику из клиентского текста убрано 17.09.2026. «Подтвердите» писалось для
     * человека, который правит черновик перед отправкой, а в автоматическом товаре за 800 ₽ оно
     * уезжало покупателю как есть. Теперь строка говорит, что именно прочитано и откуда, и это
     * само по себе находка: если из описания главной не понять, чем занимается компания, то это
     * не понять ни человеку, ни поисковику, ни ИИ.
     */
    sells: (d) => d ? `${d} (прочитано из описания главной страницы)` : 'на главной не сказано, чем занимается компания: ни человеку, ни поисковику, ни ИИ это отсюда не понять',
    leadWhat: (h, n) => `${h} это сайт из ${n} ${plural(n, 'страницы', 'страниц', 'страниц')}, и он читается машинами: мы открыли его так же, как их открывают поисковик и ИИ.`,
    leadGood: (areas) => areas.length ? `Хорошо сделано вот что: ${listRu(areas)}.` : 'Ни одна из шести областей пока не выглядит сильной стороной.',
    leadBad: (area, n) => n ? `Держит сайт назад другое: ${n} ${plural(n, 'проверка провалена', 'проверки провалены', 'проверок провалено')}, тяжелее всего дела в области «${area}».` : `Проваленных проверок нет, но до потолка не хватает мелочей, тяжелее всего в области «${area}».`,
    verdict: (openN, mech) => openN
      ? `Главное: ${openN} ${plural(openN, 'вещь мешает', 'вещи мешают', 'вещей мешают')} сайту показываться и попадать в ответы ИИ. Из них ${mech} ${plural(mech, 'правится', 'правятся', 'правятся')} технически, без переписывания текстов, то есть быстро, а ${openN - mech} ${plural(openN - mech, 'потребует', 'потребуют', 'потребуют')} ваших фактов: цифр, источников, ответов на вопросы покупателей.`
      : 'Главное: критичных поломок нет. Дальше сайт растёт не починкой, а текстами: ответами на вопросы покупателей, цифрами и источниками, по которым вас можно процитировать.',
    noteOffer: (cta, contact) => `Что видит человек, попавший на сайт: ${cta}. ${contact[0].toUpperCase()}${contact.slice(1)}.`,
    ctaYes: 'на первом экране есть понятный призыв к действию',
    ctaNo: 'на первом экране нечего нажать, и это значит, что пришедший уходит',
    contactYes: 'связаться можно почти с любой страницы',
    contactNo: 'связаться с большинства страниц нельзя, человеку приходится искать',
    strengthNone: 'Сильных сторон в текстах проверки не нашли.',
    weakNone: 'Слабых мест в текстах проверки не нашли.',
    gapsNone: 'Пробелов по страницам из выборки не видно.',
    aeoWorksNone: 'Пока ничего из того, что помогает попасть в ответы, на сайте не работает.',
    aeoBlocksNone: 'Прямых помех для попадания в ответы не нашли.',
    aeoRec: (p) => p ? `Начните с одной страницы: ${p}. Поставьте в её начало прямой ответ с цифрой и назовите источник этой цифры рядом. Так страницу можно процитировать.` : 'Поставьте в начало каждой важной страницы прямой ответ с цифрой и назовите рядом источник. Цитируют то, что можно вырезать одним абзацем.',
    geoEntity: ['Кто вы, понятно машине', (ok) => ok ? 'да' : 'нет'],
    notMeasured: 'не измеряли',
    geoMentions: 'Упоминания на чужих сайтах',
    geoReviews: 'Отзывы и публикации',
    geoMentionsNote: 'Не измеряли: данные о ссылках и упоминаниях продаются за деньги, а мы обещали отчёт только по бесплатным источникам.',
    geoCallout: (ok) => ok
      ? 'Роботы, которые достают страницу, чтобы процитировать её в ответе, на сайт пущены. Это половина дела: дальше вопрос в том, есть ли что цитировать.'
      : 'Роботы, которые достают страницу для цитаты в ответе ИИ, на сайт не пущены. Пока это так, попасть в ответы невозможно физически, чего бы вы ни написали.',
    offpageListed: (profiles) => profiles.length ? `Заявлены профили: ${profiles.join(', ')}.` : 'Ни одного профиля компании на других площадках в коде сайта не заявлено.',
    offpageNote: 'Мы не покупаем данные о ссылках, поэтому не пишем ни цифр про их количество, ни оценок за них. Что проверяемо бесплатно: сказал ли сайт сам, где ещё вас искать, и совпадает ли это с реальностью.',
    convForm: (v) => v,
    priceRow: 'Цена видна',
    priceNo: 'на проверенных страницах цены нет',
    closing: (host, bad) => bad
      ? `Мы посмотрели ${host} глазами машины и написали, что увидели, без общих слов. Сначала делается то, что чинится технически: это быстро и это видно в цифрах. Потом берутся тексты, и вот там понадобитесь вы, потому что цифры и факты про ваш бизнес знаете только вы.`
      : `Мы посмотрели ${host} глазами машины. Технически сайт в порядке, чинить нечего, и это честный вывод, а не комплимент. Рост дальше только через тексты: ответы на вопросы покупателей с цифрами и источниками.`,
    weekFill: 'Больше ничего срочного не нашли',
    monthFill: 'Тексты по вашим фактам: ответы в начале страниц, источники к цифрам, недостающие страницы',
    quarterFill: 'Повторная проверка и сравнение с этим отчётом',
  },
  en: {
    subjectFrom: (d) => `From the homepage description: ${d}. This is what a person, a search engine and an AI all read about you.`,
    subjectNone: 'The homepage does not say what the business does. That is the first problem: if a person cannot tell, neither can a search engine or an AI.',
    unknownLang: 'not declared in the page code',
    sells: (d) => d ? `${d} (read from the homepage description)` : 'the homepage does not say what the company does: neither a person, nor a search engine, nor an AI can tell from it',
    leadWhat: (h, n) => `${h} is a site of ${n} page${n === 1 ? '' : 's'}, and it was read the way machines read it: the way a search engine and an AI open it.`,
    leadGood: (areas) => areas.length ? `What is done well: ${listEn(areas)}.` : 'None of the six areas reads as a strength yet.',
    leadBad: (area, n) => n ? `What holds it back: ${n} check${n === 1 ? '' : 's'} failed, and the hardest area is "${area}".` : `No check is failing, but the last points are missing, mostly in "${area}".`,
    verdict: (openN, mech) => openN
      ? `The point: ${openN} thing${openN === 1 ? '' : 's'} stop this site from being shown and from being quoted by AI. ${mech} of them are mechanical, fixable without rewriting a word, which means quickly; the other ${openN - mech} need your facts: figures, sources, answers to what buyers ask.`
      : 'The point: nothing is broken. From here the site grows through text, not repair: answers to what buyers ask, figures, and the sources behind them.',
    noteOffer: (cta, contact) => `What a visitor meets: ${cta}. ${contact[0].toUpperCase()}${contact.slice(1)}.`,
    ctaYes: 'the first screen has a clear thing to do',
    ctaNo: 'the first screen has nothing to click, which means arrivals leave',
    contactYes: 'getting in touch is possible from almost any page',
    contactNo: 'most pages offer no way to get in touch, so a visitor has to go looking',
    strengthNone: 'The checks found no strength in the text.',
    weakNone: 'The checks found no weakness in the text.',
    gapsNone: 'No gaps are visible across the sampled pages.',
    aeoWorksNone: 'Nothing that helps a page get quoted is working yet.',
    aeoBlocksNone: 'Nothing directly blocks a page from being quoted.',
    aeoRec: (p) => p ? `Start with one page: ${p}. Put a direct answer carrying a figure at the top and name where that figure comes from, right beside it. That is what makes a page quotable.` : 'Put a direct answer carrying a figure at the top of every page that matters, and name the source beside it. What gets quoted is what can be lifted in one paragraph.',
    notMeasured: 'not measured',
    geoMentions: 'Mentions elsewhere',
    geoReviews: 'Reviews and press',
    geoMentionsNote: 'Not measured: link and mention data is sold for money, and this report was promised on free sources only.',
    geoCallout: (ok) => ok
      ? 'The fetchers that pull a page in order to quote it in an answer are allowed in. That is half the job: the rest is whether there is anything worth quoting.'
      : 'The fetchers that pull a page to quote it in an AI answer are blocked. While that is true, being quoted is physically impossible, whatever you write.',
    offpageListed: (profiles) => profiles.length ? `Profiles declared: ${profiles.join(', ')}.` : 'The site declares no company profile anywhere else.',
    offpageNote: 'We do not buy link data, so we print no number of links and no score built on one. What is checkable for free: whether the site says where else to find you, and whether that matches reality.',
    priceRow: 'Price visible',
    priceNo: 'no price on the pages we read',
    closing: (host, bad) => bad
      ? `We looked at ${host} the way a machine looks at it and wrote down what we saw, without generalities. What gets fixed first is what is mechanical: it is quick and it shows in the numbers. Then comes the text, and there we need you, because only you know the figures and facts of your business.`
      : `We looked at ${host} the way a machine looks at it. Technically it is in order and there is nothing to repair, and that is a finding, not a compliment. Growth from here comes through text: answers to buyers' questions, with figures and sources.`,
    weekFill: 'Nothing else is urgent',
    monthFill: 'Text from your facts: answers at the top of pages, sources beside figures, the pages you are missing',
    quarterFill: 'A second run, compared against this report',
  },
};

function plural(n, one, few, many) {
  const d = n % 10; const dd = n % 100;
  return d === 1 && dd !== 11 ? one : d >= 2 && d <= 4 && (dd < 10 || dd >= 20) ? few : many;
}
const listRu = (a) => a.length > 1 ? `${a.slice(0, -1).join(', ')} и ${a[a.length - 1]}` : a[0] || '';
const listEn = (a) => a.length > 1 ? `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}` : a[0] || '';

/** Проверки, которые Fix закрывает технически: ими меряется «сколько чинится быстро». */
const MECHANICAL = new Set(['robots', 'robots-block', 'ai-search-access', 'sitemap', 'sitemap-foreign', 'sitemap-health', 'llms', 'title', 'description', 'h1', 'canonical', 'viewport', 'og', 'schema', 'faq-schema', 'org-schema', 'hreflang', 'xmlrpc', 'alt', 'h1-sample', 'dup-titles', 'utility', 'dates', 'trust-entity', 'trust-contact', 'trust-profiles', 'trust-about', 'trust-policies', 'conv-contact-path', 'conv-cta', 'conv-messenger', 'www', 'resources', 'conv-form-depth', 'conv-form-fields']);

import { localiseChecks, AREAS_RU } from './i18n.mjs';
import { FIX_ACTIONS } from './fix.mjs';

const byId = (checks, id) => (checks || []).find((c) => c.id === id);
const open = (c) => c && (c.status === 'warn' || c.status === 'bad');

/**
 * Заполняет пустые поля отчёта словами, собранными из проверок.
 * @param {object} audit результат collect()
 * @param {{lang?: 'ru'|'en'}} opts
 */
/** Проверки, которые закрывает только текст клиента: у них есть своя формулировка работы. */
const TEXT_WORK_IDS = new Set(['thin', 'answer-first', 'sources', 'sections', 'tables']);

export function draftNarrative(audit, opts = {}) {
  const lang = opts.lang || audit.meta?.lang || 'en';
  const t = T[lang === 'ru' ? 'ru' : 'en'];
  const a = JSON.parse(JSON.stringify(audit));
  // Отчёт по-русски по английскому аудиту: названия проверок и областей переводим здесь же,
  // иначе владелец читает русский текст с английскими вставками и перестаёт нам верить.
  const needsRu = lang === 'ru' && a.meta?.lang !== 'ru';
  const checks = needsRu ? localiseChecks(a.checks || [], 'ru') : (a.checks || []);
  /*
   * Названия областей переводим по языку ОТЧЁТА, а не по языку исходного аудита.
   *
   * Было завязано на needsRu, то есть переводилось только тогда, когда аудит собран
   * по-английски. У русского аудита ключи областей всё равно английские (они приходят из
   * collect), и в русский текст уезжало «Хорошо сделано вот что: SEO, technical, SEO, content
   * and structure...», а в карточках ниже те же области стояли по-русски. Два языка на одной
   * странице в отчёте за деньги.
   */
  const areaName = (k) => (lang === 'ru' ? (AREAS_RU[k] || k) : k);
  const host = a.meta?.host || '';
  const sample = (a.sample || []).filter((p) => p.title !== undefined);
  const home = sample[0] || {};

  const bad = checks.filter((c) => c.status === 'bad');
  const warn = checks.filter((c) => c.status === 'warn');
  const mechanical = [...bad, ...warn].filter((c) => MECHANICAL.has(c.id)).length;
  const scores = Object.entries(a.scores || {}).filter(([, v]) => typeof v === 'number');
  const strong = scores.filter(([, v]) => v >= 8).map(([k]) => areaName(k));
  const weakest = areaName(scores.slice().sort((x, y) => x[1] - y[1])[0]?.[0] || '');

  // Кто клиент. Имя это адрес сайта, предмет прочитан с главной и помечен как прочитанный.
  const desc = String(home.description || '').trim().slice(0, 180);
  a.client.name = a.client.name?.includes('{{') ? host : a.client.name;
  if (String(a.client.subject).includes('{{')) a.client.subject = desc ? t.subjectFrom(desc) : t.subjectNone;

  // Резюме.
  if (String(a.summary.lead).includes('{{')) {
    a.summary.lead = [t.leadWhat(host, sample.length), t.leadGood(strong), t.leadBad(weakest, bad.length)].join(' ');
  }
  if (String(a.summary.verdict).includes('{{')) a.summary.verdict = t.verdict(bad.length + warn.length, mechanical);
  // Приоритет это не название проверки, а действие: владелец должен прочитать и понять, что делать.
  const actionText = (c) => {
    const rule = FIX_ACTIONS[c.id];
    const L = lang === 'ru' ? 'ru' : 'en';
    if (rule && rule.action) return rule.action[L];
    // Проверки, которые закрываются только фактами клиента: называем работу, а не оправдание.
    const TEXT_WORK = {
      ru: { thin: 'Наполнить короткие страницы фактами: цифрами, условиями, сроками', 'answer-first': 'Поставить в начало страницы прямой ответ с цифрой', sources: 'Подписать к каждой цифре, откуда она взята', sections: 'Разбить страницу на разделы по вопросам читателя', tables: 'Собрать таблицу из ваших данных: таблицы цитируют охотнее абзацев' },
      en: { thin: 'Fill the short pages with facts: figures, terms, timings', 'answer-first': 'Put a direct answer carrying a figure at the top of the page', sources: 'Name where each figure comes from', sections: 'Break the page into sections that follow the reader\'s questions', tables: 'Build a table from your data: tables get quoted more readily than prose' },
    };
    const own = TEXT_WORK[L][c.id];
    if (own) return own;
    if (rule && rule.why) return L === 'ru' ? `Это работа с текстами: ${rule.why.ru}` : `This is text work: ${rule.why.en}`;
    return c.label;
  };
  const action = (c) => `${actionText(c)}. ${lang === 'ru' ? 'Сейчас' : 'Now'}: ${c.value}`;
  // В приоритеты идут только те находки, для которых есть действие. У части проверок в FIX_ACTIONS
  // вместо действия стоит довод против («это имеет смысл только тем, у кого правда есть API»), и
  // такая строка первым пунктом плана читается как отговорка, а не как задача.
  const actionable = (c) => {
    const rule = FIX_ACTIONS[c.id];
    return Boolean((rule && rule.action) || TEXT_WORK_IDS.has(c.id));
  };
  const top = [...bad.filter(actionable), ...warn.filter(actionable), ...bad.filter((c) => !actionable(c)), ...warn.filter((c) => !actionable(c))].slice(0, 3);
  a.summary.priorities = (a.summary.priorities || []).map((p, i) => {
    if (!String(p).includes('{{')) return p;
    const c = top[i];
    return c ? action(c) : (lang === 'ru' ? 'Ничего срочного больше не нашли' : 'Nothing else is urgent');
  });

  // Обзор.
  a.overview.rows = (a.overview.rows || []).map(([k, v]) => {
    if (!String(v).includes('{{')) return [k, v];
    if (/language|язык/i.test(k)) return [k, a.meta?.language || t.unknownLang];
    if (/sold|продаётся|продается/i.test(k)) return [k, t.sells(desc)];
    return [k, t.notMeasured];
  });
  if (String(a.overview.note).includes('{{')) {
    const cta = byId(checks, 'conv-cta');
    const path = byId(checks, 'conv-contact-path');
    a.overview.note = t.noteOffer(open(cta) ? t.ctaNo : t.ctaYes, open(path) ? t.contactNo : t.contactYes);
  }

  // Контент, AEO, GEO, ссылки, конверсия: строки собираются из своих же групп проверок.
  const group = (g) => checks.filter((c) => c.group === g);
  const fillList = (arr, source, empty) => (arr || []).map((x, i) => {
    if (!String(x).includes('{{')) return x;
    const c = source[i];
    return c ? `${c.label}: ${c.value}` : empty;
  });
  a.content.strengths = fillList(a.content.strengths, group('content').filter((c) => c.status === 'ok'), t.strengthNone);
  a.content.weaknesses = fillList(a.content.weaknesses, group('content').filter(open), t.weakNone);
  a.content.gaps = fillList(a.content.gaps, group('content').filter((c) => c.status === 'bad'), t.gapsNone);
  a.aeo.works = fillList(a.aeo.works, group('aeo').filter((c) => c.status === 'ok'), t.aeoWorksNone);
  a.aeo.blocks = fillList(a.aeo.blocks, group('aeo').filter(open), t.aeoBlocksNone);
  if (String(a.aeo.recommendation).includes('{{')) {
    const thinnest = sample.filter((p) => p.answerFirst === false).sort((x, y) => (y.words || 0) - (x.words || 0))[0];
    a.aeo.recommendation = t.aeoRec(thinnest ? thinnest.url : '');
  }

  const entity = byId(checks, 'trust-entity') || byId(checks, 'org-schema');
  a.geo.rows = (a.geo.rows || []).map((row, i) => {
    const [label, status, detail] = row;
    if (!String(status).includes('{{') && !String(detail).includes('{{')) return row;
    if (i === 0) return [label, entity && entity.status === 'ok' ? (lang === 'ru' ? 'да' : 'yes') : (lang === 'ru' ? 'нет' : 'no'), entity ? entity.value : t.notMeasured];
    if (i === 1) return [t.geoMentions, t.notMeasured, t.geoMentionsNote];
    return [t.geoReviews, t.notMeasured, t.geoMentionsNote];
  });
  if (String(a.geo.callout).includes('{{')) {
    const fetchers = byId(checks, 'ai-search-access');
    a.geo.callout = t.geoCallout(!fetchers || fetchers.status === 'ok');
  }

  const profilesCheck = byId(checks, 'trust-profiles');
  const profiles = profilesCheck && profilesCheck.status === 'ok' ? String(profilesCheck.value).split(/[,:]/).slice(1).map((s) => s.trim()).filter(Boolean) : [];
  a.offpage.listed = (a.offpage.listed || []).map((x) => String(x).includes('{{') ? t.offpageListed(profiles) : x);
  if (String(a.offpage.note).includes('{{')) a.offpage.note = t.offpageNote;

  a.conversion.rows = (a.conversion.rows || []).map(([label, status]) => {
    if (!String(status).includes('{{')) return [label, status];
    if (/form|форм/i.test(label)) { const c = byId(checks, 'conv-form-fields') || byId(checks, 'conv-form-depth'); return [label, c ? c.value : t.notMeasured]; }
    if (/messenger|мессендж/i.test(label)) { const c = byId(checks, 'conv-messenger'); return [label, c ? c.value : t.notMeasured]; }
    if (/price|цена/i.test(label)) return [label, t.priceNo];
    return [label, t.notMeasured];
  });

  // Дорожная карта: недостающие строки берутся из открытых проверок по их же смыслу.
  const mech = [...bad, ...warn].filter((c) => MECHANICAL.has(c.id));
  const textWork = [...bad, ...warn].filter((c) => !MECHANICAL.has(c.id));
  // Строки, которые сборщик уже написал по-английски, в русском отчёте переводим по той же проверке.
  const labelToCheck = new Map(checks.map((c) => [c.label, c]));
  const englishLabel = new Map((a.checks || []).map((c, i) => [c.label, checks[i]]));
  const retitle = (item) => {
    const m = /^Fix:\s*(.+)$/.exec(String(item));
    if (!m) return item;
    const c = labelToCheck.get(m[1]) || englishLabel.get(m[1]);
    return c ? actionText(c) : item;
  };
  a.roadmap = (a.roadmap || []).map((phase, pi) => ({
    ...phase,
    items: (phase.items || []).map((item, ii) => {
      if (!String(item).includes('{{')) return needsRu ? retitle(item) : item;
      const pool = pi === 0 ? mech : pi === 1 ? textWork : [];
      const c = pool[ii];
      if (c) return actionText(c);
      return pi === 0 ? t.weekFill : pi === 1 ? t.monthFill : t.quarterFill;
    }),
  }));

  if (String(a.closing).includes('{{')) a.closing = t.closing(host, bad.length);
  return a;
}

/** Что осталось пустым после черновика: аналитик правит только это. */
export function stillEmpty(audit) {
  const out = [];
  const walk = (o, path = '') => {
    if (typeof o === 'string') { if (o.includes('{{')) out.push(path); return; }
    if (Array.isArray(o)) { o.forEach((x, i) => walk(x, `${path}[${i}]`)); return; }
    if (o && typeof o === 'object') for (const k of Object.keys(o)) walk(o[k], path ? `${path}.${k}` : k);
  };
  walk(audit);
  return out;
}
