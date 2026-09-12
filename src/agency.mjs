/**
 * Agency plan: the report comes out under the buyer's brand instead of ours.
 *
 * What is free and what is paid, and why the line is drawn here. Signing a report with
 * `--by "Some Agency"` is free: that is honest attribution, and the cover still carries the line
 * saying which tool collected the signals, so our name travels with every free report. The agency
 * plan buys the visual identity, a logo and a colour, and the right to drop that tool line, which
 * is what turns the PDF into the agency's own product.
 *
 * The package is MIT and its source is public, so this is a licence, not a lock: anyone able to
 * edit node_modules can walk past it. It exists to state the terms and to record who bought them,
 * the same way every open-core tool does.
 */
import { createPublicKey, verify } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Ed25519, тот же формат ключа, что и у Site Kit: OSK1.<payload>.<signature>, base64url. */
export function verifyKey(key, publicPem) {
  const m = String(key || '').trim().match(/^OSK1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
  if (!m) return { ok: false, reason: 'malformed key' };
  const payload = Buffer.from(m[1], 'base64url');
  const sig = Buffer.from(m[2], 'base64url');
  let data;
  try { data = JSON.parse(payload.toString('utf8')); } catch { return { ok: false, reason: 'unreadable payload' }; }
  if (!verify(null, payload, createPublicKey(publicPem), sig)) return { ok: false, reason: 'signature does not match' };
  if (data.expires && new Date(data.expires) < new Date()) return { ok: false, reason: `the plan lapsed on ${data.expires}`, data };
  if (data.plan && data.plan !== 'agency') return { ok: false, reason: `this key is for the ${data.plan} plan, not agency`, data };
  return { ok: true, data };
}

/** Ключ берётся из флага, из переменной окружения или из файла рядом с работой. */
export function findKey(explicit = '') {
  if (explicit) return explicit.trim();
  if (process.env.OPERSTACK_LICENCE) return process.env.OPERSTACK_LICENCE.trim();
  for (const p of ['.operstack-licence', '.operstack-licence.json']) {
    const f = resolve(process.cwd(), p);
    if (!existsSync(f)) continue;
    const raw = readFileSync(f, 'utf8').trim();
    if (raw.startsWith('{')) { try { return String(JSON.parse(raw).key || '').trim(); } catch { return ''; } }
    return raw;
  }
  return '';
}

const MIME = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const HEX = /^#?[0-9a-f]{6}$/i;
/** Логотип уезжает в PDF вместе с файлом, поэтому встраивается, а не подключается ссылкой. */
const MAX_LOGO = 512 * 1024;

/**
 * Собирает оформление отчёта. Возвращает ещё и `notes`: причины, по которым что-то не применилось,
 * чтобы человек увидел их в терминале, а не гадал, почему логотипа нет.
 */
export function resolveBranding({ by = '', logo = '', color = '', licence = '', toolLine = true } = {}) {
  const notes = [];
  const out = { preparedBy: by.trim(), logo: null, accent: '', showToolLine: true, licensed: false, licensee: '' };

  const wantsPaid = Boolean(logo || color || toolLine === false);
  if (!wantsPaid) return { ...out, notes };

  const pubPath = resolve(root, 'licensing/public.pem');
  const key = findKey(licence);
  if (!key) {
    notes.push('logo, colour and hiding the tool line need the agency plan: https://oper-stack.com/products/agency/');
    return { ...out, notes };
  }
  if (!existsSync(pubPath)) {
    notes.push('licensing/public.pem is missing from this copy, so the key cannot be checked');
    return { ...out, notes };
  }
  const r = verifyKey(key, readFileSync(pubPath, 'utf8'));
  if (!r.ok) {
    notes.push(`licence rejected: ${r.reason}`);
    return { ...out, notes };
  }
  out.licensed = true;
  out.licensee = r.data.email || r.data.name || '';

  if (logo) {
    const f = resolve(process.cwd(), logo);
    const type = MIME[extname(f).toLowerCase()];
    if (!existsSync(f)) notes.push(`logo not found: ${logo}`);
    else if (!type) notes.push(`logo must be svg, png, jpg or webp, got ${extname(f) || 'no extension'}`);
    else {
      const buf = readFileSync(f);
      if (buf.length > MAX_LOGO) notes.push(`logo is ${Math.round(buf.length / 1024)} KB, over the 512 KB the PDF can carry`);
      else out.logo = `data:${type};base64,${buf.toString('base64')}`;
    }
  }
  if (color) {
    if (!HEX.test(color)) notes.push(`colour must be six hex digits, got "${color}"`);
    else out.accent = color.startsWith('#') ? color : `#${color}`;
  }
  if (toolLine === false) out.showToolLine = false;
  return { ...out, notes };
}

/** Светлая версия цвета для подложек: тот же тон, разбавленный белым. */
export function softenHex(hex, mix = 0.86) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const up = (c) => Math.round(c + (255 - c) * mix);
  return `#${[up(r), up(g), up(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}
