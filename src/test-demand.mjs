#!/usr/bin/env node
/**
 * Карта спроса: зёрна, подсказки, частоты, покрытие, вывод.
 *
 * Здесь держится пять вещей. Зёрна берутся из заголовков без слов бренда. Подсказки
 * фильтруются по общему слову с зерном и делятся поровну между зёрнами. Клиент Topvisor
 * ходит по методам в правильном порядке, спрашивает цену до запуска и в сухом прогоне не
 * запускает ничего. Покрытие считается по словам адреса и заголовка. В выводе нет ни null,
 * ни undefined, ни нуля вместо «нет данных», и доли сходятся с таблицей.
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { toHtml } from './render.mjs';
import { verifyScores, computeScores } from './collect.mjs';
import { anchorsFromPages, enrichTitles, tokens, seedsFromPages, expandQueries, coverage, sitemapPages, topvisorClient, volumesViaTopvisor, buildDemandMap, renderDemandHtml, renderDemandMarkdown, demandSourceRow, demandCsv, demandTotals, PATTERNS, REGIONS } from './demand.mjs';

let bad = 0;
const ok = (n, c) => { if (c) console.log(`ok   ${n}`); else { bad++; console.error(`FAIL ${n}`); } };
const is = (n, a, b) => ok(`${n} (ждали ${JSON.stringify(b)}, вышло ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b));

// ---- слова
is('основа слова: квартира и квартиры совпадают', [...tokens('квартиру в сочи', 'ru')].sort(), [...tokens('квартира сочи', 'ru')].sort());
is('кириллица и латинский адрес сходятся к одной основе', tokens('квартиры у моря', 'ru'), tokens('kvartiry u morya', 'ru'));
is('варианты транслитерации схлопнуты', tokens('площадь хутор цена', 'ru'), tokens('ploshchad khutor', 'ru'));
ok('служебные слова выпадают', !tokens('как купить квартиру в сочи', 'ru').includes('как'));
ok('английские тоже, и «buy» не различает страницы', JSON.stringify(tokens('how to buy a condo in miami', 'en')) === JSON.stringify(['condo', 'miami']));
is('ё и е одно и то же', tokens('ещё жильё', 'ru'), tokens('еще жилье', 'ru'));

// ---- зёрна
{
  const pages = [
    { url: 'https://invest-cambodia.com/', title: 'Invest Cambodia | Real estate in Phnom Penh', h1: 'Real estate in Phnom Penh' },
    { url: 'https://invest-cambodia.com/visa/', title: 'Cambodia retirement visa: rules 2026 - Invest Cambodia', h1: 'Cambodia retirement visa' },
    { url: 'https://invest-cambodia.com/contact/', title: 'Contact us', h1: 'Contact us' },
  ];
  const s = seedsFromPages(pages, { host: 'www.invest-cambodia.com' });
  ok('бренд вырезан из зёрен', !s.some((x) => /invest/.test(x)) && s.includes('real estate in phnom penh'));
  ok('заголовок разбит по разделителям', s.includes('retirement visa: rules 2026'.replace(': rules 2026', '')) || s.includes('retirement visa') || s.includes('cambodia retirement visa'));
  ok('«contact us» не зерно', !s.includes('contact us'));
  ok('дубли схлопнуты', new Set(s).size === s.length);
  is('лимит зёрен работает', seedsFromPages(pages, { host: 'x.com', max: 1 }).length, 1);
  // Главная MORE Group 15.09.2026: заголовок с брендом и сроком, H1 с ценой, меню из кнопок.
  const mg = seedsFromPages([{
    url: 'https://moregroupestate.ru/', title: 'MORE Group: агентство недвижимости на Пхукете. Подбор объекта за 2 часа', h1: 'Новые проекты на Пхукете от 4,6 млн ₽',
    h2: ['Получите подборку под ваш бюджет', 'Районы Пхукета', 'Калькулятор доходности', 'Почему инвестировать в Пхукет?'],
    nav: ['MORE Group', 'О компании', 'Подборка за 2 часа', 'Получить подборку за 2 часа', 'M MAX без VPN', 'TG Telegram', 'WA WhatsApp'],
  }], { host: 'moregroupestate.ru', brand: 'MORE Group' });
  is('H1 без цены идёт первым', mg[0], 'новые проекты на пхукете');
  ok('тема из заголовка после двоеточия', mg.includes('агентство недвижимости на пхукете'));
  ok('подзаголовки дают темы, если держатся за якорь', mg.includes('районы пхукета') && mg.includes('почему инвестировать в пхукет'));
  ok('подзаголовок без якоря (лозунг) не зерно', !mg.includes('гибкие планы оплаты') && !mg.includes('калькулятор доходности'));
  ok('кнопки, мессенджеры и бренд не зёрна', !mg.some((x) => /подборк|telegram|whatsapp|vpn|more group|о компании/.test(x)));
  const an = anchorsFromPages([{ title: 'MORE Group: агентство недвижимости на Пхукете', h1: 'Новые проекты на Пхукете от 4,6 млн ₽' }], { host: 'moregroupestate.ru', brand: 'MORE Group', lang: 'ru' });
  ok('якоря: тема без бренда, чисел и единиц', an.has('phuke') && an.has('nedvi') && !an.has('more') && !an.has('group') && !an.has('mln') && ![...an].some((t) => /\d/.test(t)));
  const an2 = anchorsFromPages([{ title: 'MORE Group: агентство недвижимости на Пхукете. Подбор объекта за 2 часа', h1: '' }], { host: 'moregroupestate.ru', brand: 'MORE Group', lang: 'ru' });
  ok('срок из заголовка («за 2 часа») не якорь', !an2.has('chasa') && an2.has('podbo'));
  const cam = seedsFromPages([{ title: 'Invest Cambodia: property investment in Phnom Penh', h1: 'Property investment for foreign buyers', h2: ['What changed', 'Who should not buy here', 'Areas of Phnom Penh'], nav: ['Get your shortlist'] }], { host: 'invest-cambodia.com', lang: 'en' });
  ok('лозунги главной не зёрна, а раздел про районы да', !cam.includes('what changed') && !cam.includes('who should not buy here') && cam.includes('areas of phnom penh'));
  const camAn = anchorsFromPages([{ title: 'Property, measured before it is sold', h1: 'Property investment for foreign buyers' }], { host: 'invest-cambodia.com', lang: 'en' });
  ok('география из имени домена стала якорем, а общее слово «invest» нет', camAn.has('cambo') && !camAn.has('inves'));
  const mgAn = anchorsFromPages([{ title: 'MORE Group: агентство недвижимости на Пхукете', h1: '' }], { host: 'moregroupestate.ru', brand: 'MORE Group', lang: 'ru' });
  ok('склеенное имя домена якорем не стало', !mgAn.has('moreg'));
  const rep = seedsFromPages([{ title: 'Виллы на Пхукете | Юг-Дом', h1: '' }, { title: 'Дома у моря | Юг-Дом', h1: '' }], { host: 'x.ru' });
  ok('повторяющийся сегмент заголовка признан брендом', rep.includes('виллы на пхукете') && !rep.some((x) => /юг-дом/.test(x)));
}

// ---- подсказки с поддельным автодополнением
{
  const fake = async (url) => {
    const q = decodeURIComponent((url.match(/[?&](?:q|part)=([^&]*)/) || [])[1] || '');
    if (/сломан/.test(q)) throw new Error('boom');
    const base = q.replace(/^(как|где|что такое|сколько стоит)\s+/, '').replace(/\s+(цена|отзывы|или)$/, '');
    return [q, [`${base} недорого`, `${base} у моря`, 'совсем другое', 'один', `${q} 2026`]];
  };
  const r = await expandQueries(['квартира в сочи', 'дом в сломанном месте'], { lang: 'ru', region: 225, max: 6, delayMs: 0, fetchJson: fake, engines: ['yandex'] });
  is('обращений столько, сколько шаблонов на зерно', r.calls, PATTERNS.ru.length * 2);
  ok('падение одного зерна не роняет прогон', r.failed === PATTERNS.ru.length && r.queries.length > 0);
  ok('чужие фразы отфильтрованы по общему слову', !r.queries.includes('совсем другое'));
  ok('фразы из одного слова выпали', !r.queries.includes('один'));
  ok('лимит соблюдён', r.queries.length <= 6);
  ok('само зерно в списке первым', r.queries[0] === 'квартира в сочи');
  const two = await expandQueries(['alpha beta', 'gamma delta'], { lang: 'en', region: 84, max: 4, delayMs: 0, engines: ['google'], fetchJson: async (u) => { const q = decodeURIComponent((u.match(/q=([^&]*)/) || [])[1]); const b = q.replace(/^(how to|what is|best)\s+/, '').replace(/\s+(cost|price|near me|vs)$/, ''); return [q, [`${b} one`, `${b} two`, `${b} three`]]; } });
  ok('квота делится между зёрнами поровну', two.queries.filter((q) => q.startsWith('alpha')).length === 2 && two.queries.filter((q) => q.startsWith('gamma')).length === 2);
  const anchored = await expandQueries(['квартира в сочи'], { lang: 'ru', region: 225, max: 20, delayMs: 0, engines: ['yandex'], anchors: new Set(['sochi']), fetchJson: async () => ['x', ['квартира в сочи недорого', 'квартира в анапе недорого', 'квартиры сочи у моря']] });
  ok('без якорного слова запрос выпадает, даже если делит слово с зерном', anchored.queries.includes('квартира в сочи недорого') && anchored.queries.includes('квартиры сочи у моря') && !anchored.queries.includes('квартира в анапе недорого'));
}

// ---- покрытие
{
  const pages = [{ url: 'https://x.ru/kvartiry-v-sochi/', title: '', h1: '' }, { url: 'https://x.ru/blog/post-1/', title: 'Дом у моря: цены 2026', h1: 'Дом у моря' }];
  const c = coverage(['купить квартиру в сочи', 'дом у моря цена', 'вилла в анапе'], pages, { lang: 'ru' });
  ok('покрытие по латинскому адресу русского сайта', c[0].covered && c[0].url === 'https://x.ru/kvartiry-v-sochi/');
  ok('покрытие по заголовку', c[1].covered && /post-1/.test(c[1].url));
  ok('нет страницы, значит нет', !c[2].covered && c[2].url === null);
  const en = coverage(['buy condo miami', 'phuket villa rental', 'rent condo miami'], [{ url: 'https://y.com/miami/condos-for-sale/', title: '', h1: '' }], { lang: 'en' });
  ok('«купить» не отличает страницу: сайт продажи отвечает на запрос про покупку', en[0].covered && !en[1].covered);
  ok('а «снять» отличает: страница продажи не про аренду', !en[2].covered);
}

// ---- карты сайта
{
  const files = {
    'https://x.ru/robots.txt': 'User-agent: *\nSitemap: https://x.ru/sitemap-index.xml\n',
    'https://x.ru/sitemap-index.xml': '<sitemapindex><sitemap><loc>https://x.ru/s1.xml</loc></sitemap><sitemap><loc>https://x.ru/s2.xml</loc></sitemap></sitemapindex>',
    'https://x.ru/s1.xml': '<urlset><url><loc>https://x.ru/a/</loc></url><url><loc>https://x.ru/b/</loc></url></urlset>',
    'https://x.ru/s2.xml': '<urlset><url><loc>https://x.ru/c/</loc></url><url><loc> https://x.ru/a/ </loc></url></urlset>',
  };
  const p = await sitemapPages('https://x.ru/', { fetchText: async (u) => { if (!files[u]) throw new Error('404'); return files[u]; } });
  is('адреса из вложенных карт без дублей', p.map((x) => x.url), ['https://x.ru/a/', 'https://x.ru/b/', 'https://x.ru/c/']);
  const none = await sitemapPages('https://y.ru/', { fetchText: async () => { throw new Error('404'); } });
  is('без карты пустой список, не ошибка', none, []);
}

// ---- заголовки для английских адресов русского сайта
{
  let fetched = 0;
  const html = { 'https://x.ru/districts/': '<title>Районы Пхукета: где купить | Юг-Дом</title><h1>Районы Пхукета</h1>', 'https://x.ru/districts/bang-tao/': '<title>Банг Тао</title>', 'https://x.ru/a/b/c/': '<title>Глубоко</title>' };
  const pages = [{ url: 'https://x.ru/a/b/c/', title: '', h1: '' }, { url: 'https://x.ru/districts/bang-tao/', title: '', h1: '' }, { url: 'https://x.ru/districts/', title: '', h1: '' }, { url: 'https://x.ru/dead/', title: '', h1: '' }];
  const done = await enrichTitles(pages, { max: 3, concurrency: 2, fetchText: async (u) => { fetched += 1; if (!html[u]) throw new Error('404'); return html[u]; } });
  ok('короткие адреса читаются первыми, лимит соблюдён', fetched === 3 && done === 2 && pages.find((p) => p.url === 'https://x.ru/a/b/c/').title === '' && pages.find((p) => p.url === 'https://x.ru/districts/bang-tao/').title === 'Банг Тао');
  ok('страница без ответа остаётся адресом, не ошибкой', pages.find((p) => p.url === 'https://x.ru/dead/').title === '');
  const c = coverage(['районы пхукета'], pages, { lang: 'ru' });
  ok('русский запрос нашёл страницу с английским адресом по заголовку', c[0].covered && c[0].url === 'https://x.ru/districts/');
}

// ---- Topvisor на поддельном сервере
function fakeTopvisor() {
  const state = { projects: [{ id: 1, name: 'Другой', site: 'z.ru' }], searchers: {}, groups: [], keywords: [], launched: 0, polls: 0, calls: [] };
  const server = createServer((req, res) => {
    let raw = ''; req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      const method = req.url.replace(/^\//, '');
      let body = {};
      const ct = req.headers['content-type'] || '';
      if (ct.startsWith('multipart/form-data')) {
        const b = ct.split('boundary=')[1];
        for (const part of raw.split(`--${b}`)) { const m = part.match(/name="([^"]+)"\r\n\r\n([\s\S]*?)\r\n$/); if (m) body[m[1]] = m[2]; }
      } else { try { body = JSON.parse(raw || '{}'); } catch { body = {}; } }
      state.calls.push({ method, body, auth: req.headers.authorization, uid: req.headers['user-id'] });
      const send = (result) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ result })); };
      const fail = (s) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ result: null, errors: [{ code: 2001, string: s }] })); };
      if (method === 'get/projects_2/projects') {
        const list = state.projects.filter((p) => !body.filters || body.filters.every((f) => f.values.includes(p.id)));
        return send(body.show_searchers_and_regions ? list.map((p) => ({ ...p, searchers: Object.entries(state.searchers[p.id] || {}).map(([k, regs]) => ({ key: Number(k), regions: regs.map((r) => ({ key: r })) })) })) : list);
      }
      if (method === 'add/projects_2/projects') { state.projects.push({ id: 7, name: body.name, site: body.url }); return send(7); }
      if (method === 'add/positions_2/searchers') { state.searchers[body.project_id] ||= {}; if (state.searchers[body.project_id][body.searcher_key]) return fail('Поисковая система уже добавлена'); state.searchers[body.project_id][body.searcher_key] = []; return send(1); }
      if (method === 'add/positions_2/searchers/regions') { state.searchers[body.project_id][body.searcher_key].push(body.region_key); return send(1); }
      if (method === 'add/keywords_2/groups') { if (!Array.isArray(body.name)) return fail('name must be array'); const id = 100 + state.groups.length; state.groups.push({ id, name: body.name[0], project_id: body.project_id }); return send([id]); }
      if (method === 'get/keywords_2/groups') return send(state.groups.filter((g) => g.project_id === body.project_id));
      if (method === 'add/keywords_2/keywords/import') { for (const k of String(body.keywords).split('\n')) state.keywords.push({ id: state.keywords.length + 1, name: k, group_id: Number(body.group_id) }); return send(state.keywords.length); }
      if (method === 'get/keywords_2/volumes/price') { const n = state.keywords.filter((k) => k.group_id === body.filters[0].values[0]).length; return send({ pricesByUsers: { 1: { price: Math.round(n * 2) / 100, limits: n } } }); }
      if (method === 'edit/keywords_2/volumes/go') { state.launched += 1; return send(true); }
      if (method === 'get/keywords_2/keywords') {
        state.polls += 1;
        const field = body.fields.find((f) => f.startsWith('volume:'));
        return send(state.keywords.filter((k) => k.group_id === body.filters[0].values[0]).map((k, i) => ({ id: k.id, name: k.name, [field]: state.polls >= 2 ? (i + 1) * 100 : null })));
      }
      return fail(`Call to undefined method: ${method}`);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ state, server, base: `http://127.0.0.1:${server.address().port}/` })));
}
{
  const { state, server, base } = await fakeTopvisor();
  const client = topvisorClient({ userId: '5', key: 'secret', base });
  const dry = await volumesViaTopvisor(['купить квартиру в сочи', 'дом у моря цена'], { lang: 'ru', region: 225, client, dry: true, groupName: 'x.ru 2026-09-15' });
  ok('сухой прогон: цена получена, ничего не запущено', dry.price === 0.04 && !dry.launched && state.launched === 0 && /dry/.test(dry.note));
  ok('заголовки с ключами на месте', state.calls.every((c) => c.auth === 'bearer secret' && c.uid === '5'));
  const order = state.calls.map((c) => c.method);
  ok('проект создан, потому что его не было', order.includes('add/projects_2/projects') && state.projects.some((p) => p.name === 'OperStack: карта спроса'));
  ok('цена спрошена после импорта и до запуска', order.indexOf('add/keywords_2/keywords/import') < order.indexOf('get/keywords_2/volumes/price') && !order.includes('edit/keywords_2/volumes/go'));
  const priceCall = state.calls.find((c) => c.method === 'get/keywords_2/volumes/price').body;
  is('определитель частоты: регион, Яндекс, тип 1', priceCall.qualifiers, [{ region_key: 225, searcher_key: 0, type: 1 }]);
  is('фильтр по группе, а не по всему проекту', priceCall.filters[0].name, 'group_id');
  const full = await volumesViaTopvisor(['купить квартиру в сочи', 'дом у моря цена'], { lang: 'ru', region: 225, client, groupName: 'x.ru 2026-09-15 b', pollMs: 1 });
  ok('полный прогон: запущено один раз, частоты заполнены', state.launched === 1 && full.launched && full.filled === 2 && full.volumes['купить квартиру в сочи'] === 100 && full.volumes['дом у моря цена'] === 200);
  ok('повторное добавление поисковика не ошибка', full.projectId === 7);
  const en = await volumesViaTopvisor(['buy condo miami'], { lang: 'en', region: 84, client, groupName: 'y.com', pollMs: 1 });
  is('для английского: Google, тип 3, регион 84', state.calls.filter((c) => c.method === 'edit/keywords_2/volumes/go').pop().body.qualifiers, [{ region_key: 84, searcher_key: 1, type: 3 }]);
  ok('поле частоты названо по определителю', state.calls.filter((c) => c.method === 'get/keywords_2/keywords').pop().body.fields.includes('volume:84:1:3'));
  ok('без ключей источник «none», а не ошибка', (await volumesViaTopvisor(['x y'], { client: null })).source === 'none');
  server.close();
}

// ---- вся карта с подделками и вывод
{
  const { state, server, base } = await fakeTopvisor();
  const client = topvisorClient({ userId: '5', key: 'secret', base });
  const files = {
    'https://x.ru/': '<html><head><title>Квартиры у моря в Сочи | Юг-Дом</title></head><body><h1>Квартиры у моря в Сочи</h1><nav><a href="/">Главная</a><a href="/doma/">Дома в Сочи</a></nav></body></html>',
    'https://x.ru/robots.txt': 'Sitemap: https://x.ru/sitemap.xml',
    'https://x.ru/sitemap.xml': '<urlset><url><loc>https://x.ru/kvartiry-u-morya-v-sochi/</loc></url><url><loc>https://x.ru/doma/</loc></url></urlset>',
  };
  const fetchJson = async (u) => { const q = decodeURIComponent((u.match(/[?&](?:q|part)=([^&]*)/) || [])[1] || ''); const b = q.replace(/^(как|где|что такое|сколько стоит)\s+/, '').replace(/\s+(цена|отзывы|или)$/, ''); return [q, [`${b} недорого`, `${b} вторичка`]]; };
  const d = await buildDemandMap('https://x.ru/', { lang: 'ru', client, fetchText: async (u) => { if (!files[u]) throw new Error('404'); return files[u]; }, fetchJson, delayMs: 0, pollMs: 1, max: 20, engines: ['yandex'] });
  ok('хозяин и регион названы', d.host === 'x.ru' && d.region === 225 && d.regionName === 'Россия');
  ok('зёрна без бренда', d.seeds.includes('квартиры у моря в сочи') && !d.seeds.some((s) => /юг-дом/.test(s)));
  ok('частоты собраны на все запросы', d.volumes.source === 'Topvisor' && d.totals.withVolume === d.totals.queries && d.totals.queries > 0);
  ok('отсортировано по частоте', d.queries.every((q, i) => i === 0 || (d.queries[i - 1].volume ?? -1) >= (q.volume ?? -1)));
  ok('итоги сходятся', d.totals.covered + d.totals.uncovered === d.totals.queries && d.totals.volumeCovered + d.totals.volumeUncovered === d.totals.volumeTotal);
  ok('есть и покрытые, и непокрытые', d.totals.covered > 0 && d.totals.uncovered > 0);
  ok('в JSON нет undefined', !/undefined/.test(JSON.stringify(d)));
  const html = renderDemandHtml(d);
  const md = renderDemandMarkdown(d);
  ok('в выводе нет null, undefined, NaN', !/null|undefined|NaN/.test(html + md));
  ok('вывод называет долю спроса без страницы', /% спроса ниши/.test(html) && /% спроса ниши/.test(md));
  ok('источник назван и сказано, где проверить бесплатно', /Topvisor/.test(html) && /wordstat\.yandex\.ru/.test(html) && /в баллы отчёта они не входят/.test(html));
  ok('таблица содержит запросы и адреса', /<table>/.test(html) && /\/kvartiry-u-morya-v-sochi\//.test(html));
  const enHtml = renderDemandHtml({ ...d, lang: 'en', regionName: 'Russia' }, { lang: 'en' });
  ok('английский вывод без кириллицы вне запросов', !/[А-Яа-яЁё]/.test(enHtml.replace(/<td>[^<]*<\/td>/g, '')));
  const row = demandSourceRow(d);
  ok('строка источников: платно и не в балл', /Платный/.test(row.access) && /не входит/.test(row.access));
  const csv = demandCsv(d).split('\n');
  ok('csv: шапка плюс строка на запрос', csv.length === d.queries.length + 1 && csv[0] === '"query","volume","has_page","url"');
  const off = await buildDemandMap('https://x.ru/', { lang: 'ru', volumes: false, fetchText: async (u) => files[u] || '', fetchJson, delayMs: 0, max: 5, engines: ['yandex'] });
  ok('без частот доля считается по числу запросов и так и сказано', off.volumes.source === 'none' && /по числу запросов/.test(renderDemandHtml(off)) && /% найденных вопросов/.test(renderDemandHtml(off)));
  ok('запрос без частоты подписан словами, а не нулём', /нет данных/.test(renderDemandHtml(off)) && !/<td class="num">0<\/td>/.test(renderDemandHtml(off)));
  const empty = renderDemandHtml({ host: 'e.ru', lang: 'ru', region: 225, regionName: 'Россия', seeds: [], discovery: { engines: ['yandex'] }, volumes: { source: 'none' }, queries: [], totals: demandTotals([]) });
  ok('пустая карта объяснена словами', /ни одного запроса/.test(empty) && !/NaN/.test(empty));
  is('регионов по умолчанию хватает на оба языка', [REGIONS[225].engine, REGIONS[84].engine], ['yandex', 'google']);
  server.close();
}

// ---- отчёт: карта печатается приложением, входит в таблицу источников и не трогает баллы
{
  const sample = JSON.parse(readFileSync(new URL('../examples/sample-audit.json', import.meta.url), 'utf8'));
  const before = JSON.stringify(computeScores(sample.checks || []).scores);
  const fixture = { host: 'example-villas.example', lang: 'en', region: 84, regionName: 'United States', seeds: ['villas phuket'], discovery: { calls: 8, failed: 0, engines: ['google'] }, pagesIndexed: 3, volumes: { source: 'Topvisor', engine: 'google', type: 3, price: 1.2, currency: 'RUB', filled: 2, asked: 2, note: '', projectId: 1, groupId: 2 }, queries: [{ q: 'villas phuket for sale', volume: 880, covered: true, url: 'https://www.example-villas.example/villas/' }, { q: 'phuket villa rental', volume: 590, covered: false, url: null }] };
  fixture.totals = demandTotals(fixture.queries);
  const withMap = { ...sample, demand: fixture };
  const html = toHtml(withMap);
  ok('в отчёте появилась страница «11 · Demand»', /11 · Demand/.test(html) && /Demand map/.test(html));
  ok('таблица источников называет Topvisor платным и не входящим в балл', /Topvisor \(volumes for the demand map\)/.test(html) && /counts towards no score/.test(html));
  ok('без карты страницы нет', !/11 · Demand/.test(toHtml(sample)));
  is('баллы с картой и без неё одинаковы', JSON.stringify(computeScores(withMap.checks || []).scores), before);
  ok('проверка баллов проходит с картой', verifyScores(withMap).ok !== false);
  const ruHtml = toHtml({ ...sample, meta: { ...sample.meta, lang: 'ru' }, demand: { ...fixture, lang: 'ru', regionName: 'США' } });
  ok('русский отчёт: «11 · Спрос»', /11 · Спрос/.test(ruHtml) && /Карта спроса/.test(ruHtml));
}

if (bad) { console.error(`\n${bad} тест(ов) упало`); process.exit(1); }
console.log('\nкарта спроса: зёрна, подсказки, частоты, покрытие и вывод в порядке');
