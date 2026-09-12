/**
 * Пакетный прогон: список сайтов на входе, готовые отчёты на выходе.
 *
 * Агентство живёт не одним сайтом, а двадцатью, и запускать их по одному вручную никто не станет.
 * Здесь нет ничего, чего не делает обычный прогон: тот же сбор, тот же черновик, та же вёрстка,
 * просто по очереди и с общим оформлением. Упавший сайт не останавливает остальные: он попадает
 * в отчёт о прогоне со своей причиной, потому что девятнадцать готовых отчётов лучше, чем ноль.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { collect } from './collect.mjs';
import { render } from './render.mjs';
import { draftNarrative as draft } from './narrative.mjs';

/** Строки списка: адрес и, через запятую, имя клиента для обложки. Пустые строки и # игнорируются. */
export function parseList(text) {
  const out = [];
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [url, ...rest] = line.split(',');
    const name = rest.join(',').trim();
    try {
      const u = new URL(url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`);
      out.push({ url: u.toString(), name: name || u.host });
    } catch {
      out.push({ url: url.trim(), name, invalid: true });
    }
  }
  return out;
}

/** Имя файла из адреса: понятное человеку, без косых черт и без совпадений между сайтами. */
const slug = (u) => {
  try { return new URL(u).host.replace(/^www\./, '').replace(/[^a-z0-9.-]/gi, '-'); }
  catch { return String(u).replace(/[^a-z0-9.-]/gi, '-').slice(0, 60) || 'site'; }
};

export async function runBatch(items, {
  outDir = 'reports', pages = 12, lang = 'en', brand = null, pdf = false,
  log = () => {}, onDone = () => {},
} = {}) {
  mkdirSync(resolve(outDir), { recursive: true });
  const results = [];
  for (const [i, item] of items.entries()) {
    const label = `${i + 1}/${items.length} ${item.url}`;
    if (item.invalid) {
      results.push({ ...item, ok: false, reason: 'not a valid address' });
      log(`${label}: пропущен, адрес не разобран`);
      continue;
    }
    try {
      log(`${label}: собираю`);
      const audit = await collect(item.url, { pages, lang, rendered: false, preparedBy: brand?.preparedBy || '' });
      audit.client.name = item.name;
      draft(audit, { lang });
      const base = join(resolve(outDir), slug(item.url));
      writeFileSync(`${base}.json`, JSON.stringify(audit, null, 2));
      const r = await render(audit, { out: `${base}.html`, pdf, brand });
      results.push({ ...item, ok: true, json: `${base}.json`, html: `${base}.html`, pdf: r.pdf, scores: audit.scores });
      log(`${label}: готово`);
    } catch (err) {
      results.push({ ...item, ok: false, reason: err.message });
      log(`${label}: не вышло, ${err.message}`);
    }
    onDone(results[results.length - 1]);
  }
  return results;
}

/** Короткая сводка для человека: что получилось, что нет и почему. */
export function summarise(results) {
  const ok = results.filter((r) => r.ok);
  const bad = results.filter((r) => !r.ok);
  const lines = [`готово ${ok.length} из ${results.length}`];
  for (const r of bad) lines.push(`  не вышло ${r.url}: ${r.reason}`);
  return lines.join('\n');
}

export function readList(path) {
  return parseList(readFileSync(resolve(path), 'utf8'));
}
