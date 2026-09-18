/**
 * Готовые файлы: проверяем не «собралось ли», а что ничего не выдумано.
 *
 * Главный сторож здесь последний: поле, которого нет в данных, обязано остаться пропуском со
 * словами «впишите», а не догадкой. Придуманный адрес в разметке это ложь, которую потом
 * прочитают и поисковик, и ИИ.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildLlmsTxt, buildOrganisationSchema, fixTitlesAndDescriptions } from './handover.mjs';

const ok = (name, cond) => { assert.ok(cond, name); console.log('ok  ', name); };

const audit = {
  meta: { host: 'shop.ru', site: 'https://shop.ru/', lang: 'ru' },
  entity: { profiles: ['vk.com/shop', 't.me/shop'], telephone: true, email: false },
  sample: [
    { url: 'https://shop.ru/', title: 'Станки для деревообработки с гарантией и сервисом · ШопРу', description: 'Продаём и обслуживаем станки для деревообработки по всей России: сто двадцать моделей в наличии, доставка за три дня.', h1: 'Станки для дерева', firstPara: 'Мы продаём станки с 2011 года.', words: 900 },
    { url: 'https://shop.ru/catalog/', title: 'Каталог', description: '', h1: 'Каталог станков', firstPara: 'Сто двадцать моделей в наличии на складе в Москве, доставка по России за три дня.', words: 700 },
    { url: 'https://shop.ru/catalog/cnc/', title: 'Станки с ЧПУ для серийного производства мебели на заказ · ШопРу', description: 'Коротко', h1: 'Станки с ЧПУ для серийного производства мебели', firstPara: 'Станки с числовым управлением для серийного производства мебели.', words: 800 },
    { url: 'https://shop.ru/catalog/rare/', title: 'Очень длинный заголовок страницы, который точно не помещается в выдачу поисковика и будет обрезан', description: 'Сто двадцать моделей в наличии на складе в Москве, доставка по России за три дня и пусконаладка в цене.', h1: 'Станки', words: 800 },
  ],
};

// Карта для агентов
{
  const txt = buildLlmsTxt(audit, { lang: 'ru' });
  ok('карта начинается с названия компании, а не с фразы о странице', txt.startsWith('# ШопРу\n'));
  ok('в карте есть абзац о сайте', /^> Продаём и обслуживаем/m.test(txt));
  ok('страницы сгруппированы в разделы', /^## catalog$/m.test(txt) && /^## Начните отсюда$/m.test(txt));
  ok('у ссылки есть пояснение', /- \[Каталог\]\(https:\/\/shop\.ru\/catalog\/\): Сто двадцать моделей/.test(txt));
  ok('все страницы попали в карту', (txt.match(/^- \[/gm) || []).length === 4);
  ok('файл кончается переводом строки', txt.endsWith('\n'));
}

// Разметка организации
{
  const { json, missing, text } = buildOrganisationSchema(audit, { lang: 'ru' });
  assert.equal(json['@type'], 'Organization');
  assert.equal(json.name, 'ШопРу');
  assert.equal(json.url, 'https://shop.ru/');
  ok('профили сайта попали в sameAs', json.sameAs.length === 2 && json.sameAs.every((u) => u.startsWith('https://')));
  ok('разметка это валидный JSON', JSON.parse(text)['@type'] === 'Organization');
  // Вот главное: чего нет в данных, того нет и в разметке.
  ok('адреса в разметке нет, он в списке пропусков', !('address' in json) && missing.some((m) => m.field === 'address'));
  ok('почты нет, она в списке пропусков', !('email' in json) && missing.some((m) => m.field === 'email'));
  ok('телефон найден на сайте, значит в пропуски не попал', !missing.some((m) => m.field === 'telephone'));
  ok('ни одно поле не выдумано', !JSON.stringify(json).includes('ВПИСАТЬ'));
  ok('название взято из заголовка, значит проверять его не просим', !missing.some((m) => m.field === 'name'));
}

// Название компании стоит то в конце заголовка, то в начале: берём короткую часть
{
  const name = (title, host = 'x.ru') => buildOrganisationSchema({ meta: { host }, sample: [{ url: `https://${host}/`, title }] }).json.name;
  ok('хвост из одного слова это бренд', name('Станки для деревообработки · ШопРу') === 'ШопРу');
  ok('начало из двух слов тоже бренд', name('MORE Group: агентство недвижимости на Пхукете') === 'MORE Group');
  ok('через двоеточие и точку разделяется тоже', name('Проверка сайта: ваш сайт глазами ИИ · OperStack') === 'OperStack');
  ok('служебное слово в начале бренд не перебивает', name('Главная | Акме Корп Лтд') === 'Акме Корп Лтд');
}

// Названия компании в заголовке главной нет: домен подставлен, но помечен на проверку
{
  const noBrand = { meta: { host: 'shop.ru', site: 'https://shop.ru/' }, sample: [{ url: 'https://shop.ru/', title: 'Купить станки для деревообработки недорого', h1: 'Станки' }] };
  const { json, missing } = buildOrganisationSchema(noBrand, { lang: 'ru' });
  ok('фраза со страницы не выдана за название компании', json.name === 'shop.ru');
  ok('и покупателя просят проверить название', missing.some((m) => m.field === 'name' && m.what.includes('shop.ru')));
}

// Заголовки и описания
{
  const fixes = fixTitlesAndDescriptions(audit, { lang: 'ru' });
  const byPath = Object.fromEntries(fixes.map((f) => [f.path, f]));
  ok('страница с длинным заголовком найдена', byPath['/catalog/cnc/'].title.problem.includes('обрежется'));
  ok('предложенный заголовок укладывается в норму аудита', byPath['/catalog/cnc/'].title.suggestion.length >= 40 && byPath['/catalog/cnc/'].title.suggestion.length <= 60);
  ok('заголовок собран из H1 страницы', byPath['/catalog/cnc/'].title.suggestion.startsWith('Станки с ЧПУ'));
  ok('заголовок с многоточием не предлагается', !byPath['/catalog/cnc/'].title.suggestion.includes('\u2026'));
  // Коротким H1 длинный заголовок не починить, и тогда правки нет, а не огрызок с многоточием.
  ok('что нечем починить, то не предлагается', !byPath['/catalog/rare/']?.title);
  ok('страница без описания найдена', byPath['/catalog/'].description.problem.includes('нет вовсе'));
  ok('описание собрано из первого абзаца страницы', byPath['/catalog/'].description.suggestion.startsWith('Сто двадцать моделей'));
  ok('рядом всегда сказано, что там сейчас', fixes.every((f) => (!f.title || 'now' in f.title) && (!f.description || 'now' in f.description)));
  ok('главная в порядке и в список не попала', !byPath['/']);
}

// Пустой аудит ничего не ломает и ничего не выдумывает
{
  const empty = { meta: {}, sample: [] };
  ok('карта пустого сайта не падает', typeof buildLlmsTxt(empty) === 'string');
  ok('и честно просит вписать, чем занимается сайт', buildLlmsTxt(empty).includes('TODO'));
  ok('разметка пустого сайта не падает', buildOrganisationSchema(empty).json['@type'] === 'Organization');
  ok('правок у пустого сайта нет', fixTitlesAndDescriptions(empty).length === 0);
}

console.log('\nготовые файлы: всё сходится');

/*
 * Готовые файлы это то, за что платят 149. Сторож ниже следит, чтобы они не уехали в отчёт
 * дешёвой ступени: там их печатать нельзя, иначе дорогой товар нечем отличать от дешёвого.
 */
{
  const { toHtml } = await import('./render.mjs');
  const base = JSON.parse(readFileSync(new URL('../examples/sample-audit.json', import.meta.url), 'utf8'));
  const cheap = toHtml({ ...base, meta: { ...base.meta, tier: '29' } });
  const paid = toHtml({ ...base, meta: { ...base.meta, tier: 'audit' } });
  ok('в отчёте за 29 готовых файлов нет', (cheap.match(/class="page handover-page"/g) || []).length === 0);
  ok('в аудите за 149 они есть', (paid.match(/class="page handover-page"/g) || []).length >= 2 && /&quot;\@type&quot;: &quot;Organization&quot;/.test(paid));
}

/*
 * Сайт нередко перечисляет в своём sameAs партнёров, застройщиков и просто домены площадок.
 * Вставить это в разметку значит сказать поисковику, что покупатель и Sansiri одна организация.
 */
{
  const messy = {
    meta: { host: 'shop.ru', site: 'https://shop.ru/' },
    entity: { profiles: ['https://www.instagram.com/shopru/', 'https://t.me/shopru'], telephone: true, email: true },
    sample: [{ url: 'https://shop.ru/', title: 'Станки · ШопРу', description: 'Продаём станки.' }],
  };
  const { json } = buildOrganisationSchema(messy, { lang: 'ru' });
  ok('профили это адреса страниц, а не домены', json.sameAs.every((u) => new URL(u).pathname.length > 1));
  const bare = { ...messy, entity: { ...messy.entity, profiles: [] } };
  const r = buildOrganisationSchema(bare, { lang: 'ru' });
  ok('профилей нет, значит поля sameAs нет', !('sameAs' in r.json));
  ok('и о пропуске сказано прямо', r.missing.some((m) => m.field === 'sameAs'));
}

/*
 * Правка обязана чинить. Заголовок, где поменялся только знак между словами, длину не чинит,
 * а описание, оборванное на многоточии, это не готовое поле, а недоделка.
 */
{
  const a = {
    meta: { host: 'shop.ru', site: 'https://shop.ru/' },
    sample: [
      { url: 'https://shop.ru/', title: 'Станки для деревообработки с гарантией и сервисом · ШопРу', description: 'Продаём и обслуживаем станки для деревообработки по всей России: сто двадцать моделей в наличии, доставка за три дня.' },
      { url: 'https://shop.ru/privacy-policy/', title: 'Политика | ШопРу', description: '', h1: 'Политика' },
      { url: 'https://shop.ru/cnc/', title: 'ЧПУ | ШопРу', description: '', h1: 'ЧПУ' },
      { url: 'https://shop.ru/dostavka/', title: 'Доставка станков по России за три дня со склада в Москве', description: 'Мы возим станки по всей России. Доставка за три дня со склада в Москве, подъём на этаж и пусконаладка входят в цену. Работаем с 2011 года и держим свой парк машин.', h1: 'Доставка', firstPara: 'Мы возим станки по всей России. Доставка за три дня со склада в Москве, подъём на этаж и пусконаладка входят в цену. Работаем с 2011 года и держим свой парк машин.' },
    ],
  };
  const fixes = fixTitlesAndDescriptions(a, { lang: 'ru' });
  const byPath = Object.fromEntries(fixes.map((f) => [f.path, f]));
  ok('служебная страница в список не попала', !byPath['/privacy-policy/']);
  ok('перестановка знака починкой не считается', !byPath['/cnc/']);
  const d = byPath['/dostavka/'].description;
  ok('описание обрезано по концу предложения', d.suggestion.endsWith('.') && !d.suggestion.includes('…'));
  ok('и укладывается в лимит', d.suggestion.length >= 70 && d.suggestion.length <= 160);
}
