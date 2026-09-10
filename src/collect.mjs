/**
 * Collect public signals from a site. Everything here is what an external auditor sees:
 * robots.txt, sitemaps, llms.txt, the homepage and a sample of pages from the sitemap.
 * No Search Console, no analytics. The narrative fields are left for the analyst.
 */
import { parse } from 'node-html-parser';

const UA = 'Mozilla/5.0 (compatible; OperStackAudit/0.1; +https://oper-stack.com)';

async function get(url, { method = 'GET', timeout = 15000 } = {}) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), timeout);
  const started = Date.now();
  try {
    const res = await fetch(url, { method, redirect: 'manual', signal: c.signal, headers: { 'user-agent': UA, accept: 'text/html,application/xml,text/plain,*/*' } });
    const ttfb = Date.now() - started;
    const text = method === 'GET' ? await res.text() : '';
    return { ok: res.ok, status: res.status, location: res.headers.get('location'), type: res.headers.get('content-type') || '', text, ttfb, url };
  } catch (e) { return { ok: false, status: 0, error: e.name === 'AbortError' ? 'timeout' : e.message, text: '', ttfb: Date.now() - started, url }; }
  finally { clearTimeout(t); }
}

async function follow(url, max = 5) {
  const hops = [];
  let cur = url;
  for (let i = 0; i < max; i++) {
    const r = await get(cur);
    hops.push({ url: cur, status: r.status, location: r.location });
    if (r.status >= 300 && r.status < 400 && r.location) { cur = new URL(r.location, cur).href; continue; }
    return { final: cur, response: r, hops };
  }
  return { final: cur, response: await get(cur), hops };
}

const row = (id, group, label, status, value, comment = '') => ({ id, group, label, status, value, comment });

function analysePage(url, html) {
  const root = parse(html, { blockTextElements: { script: true, style: true, noscript: true } });
  const attr = (sel, a) => root.querySelector(sel)?.getAttribute(a) ?? '';
  const title = root.querySelector('title')?.text.trim() ?? '';
  const description = attr('meta[name="description"]', 'content').trim();
  const h1s = root.querySelectorAll('h1').map((h) => h.text.trim()).filter(Boolean);
  const imgs = root.querySelectorAll('img');
  const imgsNoAlt = imgs.filter((i) => !(i.getAttribute('alt') || '').trim()).length;
  const canonical = attr('link[rel="canonical"]', 'href');
  const robots = attr('meta[name="robots"]', 'content');
  const viewport = attr('meta[name="viewport"]', 'content');
  const og = { title: attr('meta[property="og:title"]', 'content'), description: attr('meta[property="og:description"]', 'content'), image: attr('meta[property="og:image"]', 'content') };
  const twitter = attr('meta[name="twitter:card"]', 'content');
  const generator = attr('meta[name="generator"]', 'content');
  const hreflang = root.querySelectorAll('link[rel="alternate"][hreflang]').length;
  const scripts = root.querySelectorAll('script[src]').length;
  const stylesheets = root.querySelectorAll('link[rel="stylesheet"]').length;
  const schemaTypes = [];
  for (const s of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const j = JSON.parse(s.text);
      const walk = (x) => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') { if (x['@type']) schemaTypes.push(...[].concat(x['@type'])); if (x['@graph']) walk(x['@graph']); } };
      walk(j);
    } catch { schemaTypes.push('(invalid JSON-LD)'); }
  }
  const body = root.querySelector('body');
  const text = (body?.text ?? '').replace(/\s+/g, ' ').trim();
  const words = (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
  const links = root.querySelectorAll('a[href]').map((a) => a.getAttribute('href') || '');
  const ld = root.querySelectorAll('script[type="application/ld+json"]').map((x) => x.text).join('\n');
  const dates = { published: attr('meta[property="article:published_time"]', 'content') || (ld.match(/"datePublished"\s*:\s*"([^"]+)"/) || [])[1] || '', modified: attr('meta[property="article:modified_time"]', 'content') || (ld.match(/"dateModified"\s*:\s*"([^"]+)"/) || [])[1] || '' };
  const shortcode = /\[[a-z_-]+ [^\]]*\]/i.test(description) || /^[A-Za-z0-9+/=]{40,}$/.test(description);
  return { url, title, titleLength: title.length, description, descriptionLength: description.length, descriptionGarbage: shortcode, h1Count: h1s.length, h1: h1s[0] || '', images: imgs.length, imagesNoAlt: imgsNoAlt, canonical, robots, viewport, og, twitter, generator, hreflang, scripts, stylesheets, schemaTypes: [...new Set(schemaTypes)], words, links, dates };
}

async function readSitemap(url, seen = new Set(), depth = 0) {
  if (seen.has(url) || depth > 3) return [];
  seen.add(url);
  const r = await get(url);
  if (!r.ok) return [];
  const locs = [...r.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  const out = [];
  for (const l of locs) {
    if (/\.xml(\.gz)?$/i.test(l) || /sitemap/i.test(l) && !/\.(html?|php)$/i.test(l) && r.text.includes('<sitemapindex')) out.push(...(await readSitemap(l, seen, depth + 1)));
    else out.push(l);
  }
  return out;
}

export async function collect(startUrl, { pages = 20, log = () => {} } = {}) {
  const origin = new URL(startUrl).origin;
  const host = new URL(startUrl).host;
  const checks = [];
  const notes = [];

  log(`homepage ${startUrl}`);
  const home = await follow(startUrl);
  const homePage = home.response.ok ? analysePage(home.final, home.response.text) : null;
  checks.push(row('https', 'technical', 'HTTPS', home.final.startsWith('https://') ? 'ok' : 'bad', home.final.startsWith('https://') ? 'certificate active' : 'site served over http'));
  const altHost = host.startsWith('www.') ? host.slice(4) : `www.${host}`;
  const alt = await follow(`${new URL(home.final).protocol}//${altHost}/`);
  const altOk = alt.final.replace(/\/$/, '') === new URL(home.final).origin.replace(/\/$/, '') || alt.hops.some((h) => h.status >= 300 && h.status < 400);
  checks.push(row('www', 'technical', 'www canonicalisation', alt.response.status === 0 ? 'warn' : altOk ? 'ok' : 'warn', alt.response.status === 0 ? `${altHost} does not resolve` : altOk ? `${altHost} redirects to ${new URL(home.final).host}` : `${altHost} answers ${alt.response.status} without redirecting`));
  checks.push(row('ttfb', 'technical', 'Time to first byte (homepage)', home.response.ttfb > 2500 ? 'bad' : home.response.ttfb > 1200 ? 'warn' : 'ok', `${home.response.ttfb} ms`, 'single request from the auditor, not a lab test'));

  log('robots.txt');
  const robots = await get(`${origin}/robots.txt`);
  const sitemapUrls = robots.ok ? [...robots.text.matchAll(/^sitemap:\s*(\S+)/gim)].map((m) => m[1]) : [];
  // robots.txt is read per user-agent block: a "Disallow: /" under an AI crawler is a policy, under * it is a catastrophe.
  const blocks = []; let cur = null;
  for (const line of robots.ok ? robots.text.split(/\r?\n/) : []) {
    const l = line.replace(/#.*$/, '').trim(); if (!l) continue;
    const m = l.match(/^([a-z-]+):\s*(.*)$/i); if (!m) continue;
    const [, k, v] = m; const key = k.toLowerCase();
    if (key === 'user-agent') { if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; blocks.push(cur); } cur.agents.push(v.trim().toLowerCase()); }
    else if (cur && (key === 'disallow' || key === 'allow')) cur.rules.push({ key, value: v.trim() });
  }
  const disallows = blocks.flatMap((b) => b.rules.filter((r) => r.key === 'disallow' && r.value).map((r) => r.value));
  const starBlocksAll = blocks.some((b) => b.agents.includes('*') && b.rules.some((r) => r.key === 'disallow' && r.value === '/'));
  const blockedAgents = blocks.filter((b) => !b.agents.includes('*') && b.rules.some((r) => r.key === 'disallow' && r.value === '/')).flatMap((b) => b.agents);
  checks.push(row('robots', 'technical', 'robots.txt', robots.ok ? (sitemapUrls.length ? 'ok' : 'warn') : 'bad', robots.ok ? `${disallows.length} disallow rule(s) in ${blocks.length} agent block(s), ${sitemapUrls.length} sitemap line(s)` : `HTTP ${robots.status}`, robots.ok && !sitemapUrls.length ? 'no Sitemap: line' : ''));
  if (starBlocksAll) checks.push(row('robots-block', 'technical', 'robots.txt blocks the whole site', 'bad', 'Disallow: / under User-agent: *', 'search engines are told not to crawl anything'));
  if (blockedAgents.length) checks.push(row('robots-ai', 'geo', 'AI crawlers blocked in robots.txt', 'na', `${blockedAgents.length} agent(s) fully disallowed, e.g. ${blockedAgents.slice(0, 4).join(', ')}`, 'a policy choice: these systems will not read the site or cite it from a fresh crawl'));

  log('sitemaps');
  const candidates = sitemapUrls.length ? sitemapUrls : [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/sitemap-index.xml`];
  let sitemapPages = []; let sitemapStatus = 'missing'; let sitemapSource = '';
  for (const u of candidates) {
    const r = await get(u);
    if (r.ok && /<(urlset|sitemapindex)/.test(r.text)) { sitemapPages = await readSitemap(u); sitemapStatus = 'ok'; sitemapSource = u; break; }
    if (sitemapUrls.includes(u)) { sitemapStatus = `HTTP ${r.status}`; sitemapSource = u; }
  }
  checks.push(row('sitemap', 'technical', 'XML sitemap', sitemapStatus === 'ok' ? 'ok' : 'bad', sitemapStatus === 'ok' ? `${sitemapPages.length} URL(s) in ${sitemapSource}` : sitemapSource ? `${sitemapSource} answers ${sitemapStatus}` : 'no sitemap found at the usual paths', sitemapStatus !== 'ok' && sitemapUrls.length ? 'robots.txt points at a sitemap that does not answer' : ''));
  const foreign = sitemapPages.filter((u) => { try { return new URL(u).host !== host && new URL(u).host !== altHost; } catch { return true; } });
  if (foreign.length) checks.push(row('sitemap-foreign', 'technical', 'Sitemap lists other hosts', 'bad', `${foreign.length} URL(s) on other hosts, e.g. ${foreign[0]}`));

  log('llms.txt');
  const llms = await get(`${origin}/llms.txt`);
  const llmsIsText = llms.ok && !/<html/i.test(llms.text.slice(0, 500));
  const llmsLinks = llmsIsText ? [...llms.text.matchAll(/https?:\/\/[^\s)\]]+/g)].map((m) => m[0]) : [];
  const llmsForeign = llmsLinks.filter((u) => { try { const h = new URL(u).host; return h !== host && h !== altHost; } catch { return false; } });
  checks.push(row('llms', 'geo', 'llms.txt', !llms.ok ? 'warn' : !llmsIsText ? 'bad' : llmsForeign.length > llmsLinks.length / 2 && llmsLinks.length > 3 ? 'bad' : 'ok',
    !llms.ok ? 'not present' : !llmsIsText ? 'answers with an HTML page, not a text index' : `${llmsLinks.length} link(s), ${llmsForeign.length} to other hosts`,
    !llms.ok ? 'answer engines get nothing to read; a generated index is a one-day job' : llmsForeign.length > 3 ? `links to ${[...new Set(llmsForeign.map((u) => new URL(u).host))].slice(0, 3).join(', ')}: an AI system may misidentify the business` : ''));

  log(`sampling up to ${pages} pages`);
  const norm = (u) => { try { const x = new URL(u); x.hash = ''; x.search = ''; if (!x.pathname.includes('.') && !x.pathname.endsWith('/')) x.pathname += '/'; return x.href.toLowerCase(); } catch { return u; } };
  const seenUrl = new Set([norm(home.final), norm(startUrl)]);
  const pool = [home.final, ...sitemapPages.filter((u) => { const n = norm(u); if (seenUrl.has(n)) return false; seenUrl.add(n); return true; })];
  const sample = [];
  for (const u of pool.slice(0, pages)) {
    const r = await get(u);
    if (r.ok && /html/i.test(r.type)) sample.push(analysePage(u, r.text));
    else if (r.status >= 300 && r.status < 400) sample.push({ url: u, redirect: r.location, status: r.status });
    else sample.push({ url: u, status: r.status, error: r.error });
  }
  const good = sample.filter((p) => p.title !== undefined);
  const hp = homePage || good[0];

  if (hp) {
    checks.push(row('title', 'onpage', 'Homepage title', hp.titleLength >= 40 && hp.titleLength <= 60 ? 'ok' : hp.titleLength ? 'warn' : 'bad', `"${hp.title}" (${hp.titleLength} chars)`, hp.titleLength < 40 ? 'short: the words that earn the click are missing' : hp.titleLength > 60 ? 'cut in results' : ''));
    checks.push(row('description', 'onpage', 'Homepage meta description', hp.descriptionGarbage ? 'bad' : hp.descriptionLength >= 70 && hp.descriptionLength <= 160 ? 'ok' : hp.descriptionLength ? 'warn' : 'bad', hp.descriptionGarbage ? 'contains a shortcode or encoded data' : `${hp.descriptionLength} chars`, hp.descriptionGarbage ? 'renders as technical garbage in the snippet' : !hp.descriptionLength ? 'missing' : ''));
    checks.push(row('h1', 'onpage', 'H1 on homepage', hp.h1Count === 1 ? 'ok' : hp.h1Count === 0 ? 'bad' : 'warn', `${hp.h1Count} H1 tag(s)`, hp.h1Count > 1 ? 'more than one H1 dilutes the page topic' : hp.h1Count === 0 ? 'no H1' : ''));
    checks.push(row('canonical', 'technical', 'Canonical tag', hp.canonical ? 'ok' : 'warn', hp.canonical || 'missing'));
    checks.push(row('viewport', 'technical', 'Mobile viewport', !hp.viewport ? 'bad' : /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/i.test(hp.viewport) ? 'warn' : 'ok', hp.viewport || 'missing', /user-scalable\s*=\s*no/i.test(hp.viewport) ? 'blocks zoom: bad for accessibility and mobile SEO' : ''));
    checks.push(row('og', 'technical', 'Open Graph and Twitter cards', hp.og.title && hp.og.image ? (hp.twitter ? 'ok' : 'warn') : 'warn', [hp.og.title ? 'og:title' : '', hp.og.image ? 'og:image' : '', hp.twitter ? `twitter:${hp.twitter}` : ''].filter(Boolean).join(', ') || 'none'));
    checks.push(row('schema', 'aeo', 'Structured data on homepage', hp.schemaTypes.length ? (hp.schemaTypes.includes('(invalid JSON-LD)') ? 'warn' : 'ok') : 'warn', hp.schemaTypes.join(', ') || 'no JSON-LD'));
    checks.push(row('faq-schema', 'aeo', 'FAQPage schema', good.some((p) => p.schemaTypes.includes('FAQPage')) ? 'ok' : 'warn', good.some((p) => p.schemaTypes.includes('FAQPage')) ? `present on ${good.filter((p) => p.schemaTypes.includes('FAQPage')).length} sampled page(s)` : 'not found in the sample'));
    checks.push(row('org-schema', 'geo', 'Organization or business schema', good.some((p) => p.schemaTypes.some((t) => /Organization|LocalBusiness|RealEstateAgent|Corporation/.test(t))) ? 'ok' : 'warn', good.some((p) => p.schemaTypes.some((t) => /Organization|LocalBusiness|RealEstateAgent|Corporation/.test(t))) ? 'present' : 'not found: answer engines have no entity to attach the site to'));
    checks.push(row('resources', 'technical', 'Page weight (homepage)', hp.scripts > 30 ? 'bad' : hp.scripts > 15 ? 'warn' : 'ok', `${hp.scripts} script file(s), ${hp.stylesheets} stylesheet(s), ${hp.images} image(s)`));
    if (hp.generator) checks.push(row('cms', 'overview', 'CMS', 'na', hp.generator));
    checks.push(row('hreflang', 'technical', 'hreflang', hp.hreflang ? 'ok' : 'na', hp.hreflang ? `${hp.hreflang} alternate(s)` : 'none (single language)'));
  }
  const imgs = good.reduce((a, p) => a + p.images, 0); const noAlt = good.reduce((a, p) => a + p.imagesNoAlt, 0);
  if (imgs) checks.push(row('alt', 'onpage', 'Image alt text', noAlt / imgs > 0.5 ? 'bad' : noAlt / imgs > 0.2 ? 'warn' : 'ok', `${imgs - noAlt} of ${imgs} images carry alt text (${Math.round((1 - noAlt / imgs) * 100)}%) across ${good.length} sampled page(s)`));
  const multiH1 = good.filter((p) => p.h1Count > 1).length;
  if (good.length > 1) checks.push(row('h1-sample', 'onpage', 'Heading structure across sample', multiH1 ? (multiH1 > good.length / 2 ? 'bad' : 'warn') : 'ok', multiH1 ? `${multiH1} of ${good.length} pages carry more than one H1` : 'one H1 per page'));
  const titles = new Map(); for (const p of good) titles.set(p.title, (titles.get(p.title) || 0) + 1);
  const dupTitles = [...titles].filter(([, n]) => n > 1);
  if (good.length > 1) checks.push(row('dup-titles', 'onpage', 'Duplicate titles in sample', dupTitles.length ? 'warn' : 'ok', dupTitles.length ? `${dupTitles.length} title(s) shared by several pages, e.g. "${dupTitles[0][0]}"` : 'every sampled page has its own title'));
  const thin = good.filter((p) => p.words < 300);
  if (good.length > 1) checks.push(row('thin', 'content', 'Thin pages in sample', thin.length > good.length / 2 ? 'bad' : thin.length ? 'warn' : 'ok', thin.length ? `${thin.length} of ${good.length} pages under 300 words` : `median ${median(good.map((p) => p.words))} words per page`));
  const utility = sitemapPages.filter((u) => /\/(shop|cart|checkout|wishlist|compare|my-account|tag|author|feed)\/?/i.test(new URL(u).pathname));
  if (utility.length) checks.push(row('utility', 'technical', 'Utility pages in the sitemap', 'warn', `${utility.length} URL(s) such as ${new URL(utility[0]).pathname}`, 'cart, wishlist, tag and author pages add noise to the index'));
  const redirected = sample.filter((p) => p.redirect).length; const broken = sample.filter((p) => p.status && p.status >= 400).length;
  if (sitemapPages.length) checks.push(row('sitemap-health', 'technical', 'Sitemap URLs that answer 200', broken ? 'bad' : redirected ? 'warn' : 'ok', `${sample.length - redirected - broken} of ${sample.length} sampled URLs answer 200${redirected ? `, ${redirected} redirect` : ''}${broken ? `, ${broken} broken` : ''}`));
  const dated = good.filter((p) => p.dates.modified || p.dates.published).length;
  if (good.length > 2) checks.push(row('dates', 'content', 'Publication dates exposed', dated ? 'ok' : 'warn', dated ? `${dated} of ${good.length} sampled pages expose dates` : 'no article dates in the sample: answer engines cannot tell what is current'));
  if (/wordpress/i.test(hp?.generator || '')) { const x = await get(`${origin}/xmlrpc.php`, { method: 'HEAD' }); if (x.status === 405 || x.status === 200) checks.push(row('xmlrpc', 'technical', 'xmlrpc.php', 'warn', `answers ${x.status}`, 'pingback endpoint open: attack surface with no SEO value')); }

  const scores = suggestScores(checks);
  const critical = checks.filter((c) => c.status === 'bad').map((c) => ({ title: c.label, text: `${c.value}${c.comment ? `. ${c.comment}` : ''}`, level: 'bad' }));

  return {
    meta: { site: home.final, host, collectedAt: new Date().toISOString(), tool: '@operstack/audit 0.1.0', auditType: 'External audit (no Search Console or analytics access)', language: hp ? (hp.og?.locale || '') : '' },
    client: { name: '{{CLIENT NAME}}', subject: '{{What the site sells and where}}', reportDate: new Date().toISOString().slice(0, 10), preparedBy: 'OperStack' },
    scores,
    summary: { lead: '{{Three sentences: what the site is, what works, what holds it back.}}', verdict: '{{Key takeaway in three sentences, ending with how fast the critical issues can be fixed.}}', priorities: ['{{Priority one}}', '{{Priority two}}', '{{Priority three}}'] },
    overview: { rows: [['CMS / stack', hp?.generator || '{{stack}}'], ['Pages in sitemap', String(sitemapPages.length)], ['Language', '{{language}}'], ['What is sold', '{{products}}']], note: '{{One paragraph on how the offer is structured on the site and whether it is clear.}}' },
    critical,
    checks,
    content: { strengths: ['{{strength}}'], weaknesses: ['{{weakness}}'], gaps: ['{{missing landing page or cluster}}'] },
    aeo: { works: ['{{what already works}}'], blocks: ['{{what blocks answer-engine wins}}'], recommendation: '{{One recommendation with a page name.}}' },
    geo: { rows: [['Entity clarity', '{{status}}', '{{detail}}'], ['Third-party mentions', '{{status}}', '{{detail}}'], ['Reviews and PR', '{{status}}', '{{detail}}']], callout: '{{Brand disambiguation note or the single biggest GEO risk.}}' },
    offpage: { listed: ['{{where the brand is already listed}}'], note: '{{One paragraph.}}' },
    conversion: { rows: [['Contact form', '{{status}}'], ['Price visible', '{{status}}'], ['Messengers', '{{status}}']] },
    limitations: ['Google Search Console: no impressions, clicks or query data', 'Analytics: no traffic or behaviour data', 'Keyword and backlink tools: not used in the external tier'],
    roadmap: [
      { badge: 'Week 1', title: 'Critical, quick wins', items: critical.map((c) => `Fix: ${c.title}`).concat(['{{...}}']) },
      { badge: 'Weeks 2 to 4', title: 'Foundation', items: ['{{pillar pages, alt text, Search Console and Bing connected}}'] },
      { badge: 'Months 2 to 3', title: 'Organic growth, AEO and GEO', items: ['{{content clusters, schema, PR, reviews}}'] },
    ],
    closing: '{{Key message for the client in three sentences.}}',
    sample: sample.map((p) => p.title !== undefined ? { url: p.url, title: p.title, words: p.words, h1Count: p.h1Count, images: p.images, imagesNoAlt: p.imagesNoAlt, schemaTypes: p.schemaTypes } : p),
    notes,
  };
}

function median(a) { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; }

/** 0 to 10 per group from the statuses: ok 1, warn 0.5, bad 0; na ignored. An analyst may override. */
export function suggestScores(checks) {
  const groups = { technical: 'SEO, technical', onpage: 'SEO, content and structure', content: 'SEO, content and structure', aeo: 'AEO, answers and snippets', geo: 'GEO, visibility in AI systems' };
  const acc = {};
  for (const c of checks) {
    const g = groups[c.group]; if (!g || c.status === 'na') continue;
    acc[g] ??= { n: 0, s: 0 }; acc[g].n++; acc[g].s += c.status === 'ok' ? 1 : c.status === 'warn' ? 0.5 : 0;
  }
  const out = {};
  for (const [g, { n, s }] of Object.entries(acc)) out[g] = Math.round((s / n) * 10);
  for (const g of ['Off-page and trust', 'Conversion and UX']) out[g] = out[g] ?? null;
  return out;
}
