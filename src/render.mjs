/**
 * Render audit.json into the OperStack report: A4 pages, print-ready, and optionally a PDF
 * through headless Chrome. Every narrative field is read from the JSON; a field that still
 * holds a {{placeholder}} is rendered highlighted so it cannot ship unnoticed.
 */
import { writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const isPlaceholder = (s) => typeof s === 'string' && /\{\{[^}]*\}\}/.test(s);
const t = (s) => (isPlaceholder(s) ? `<mark class="todo">${esc(s)}</mark>` : esc(s));
const STATUS = { ok: ['✓ OK', 'status-ok'], warn: ['△ Partial', 'status-warn'], bad: ['✗ Problem', 'status-bad'], na: ['·', 'status-na'] };
const scoreClass = (n) => (n === null || n === undefined ? '' : n <= 3 ? 'low' : n <= 6 ? 'mid' : 'ok');

export function checkNarrative(audit) {
  const out = [];
  const walk = (v, path) => {
    if (typeof v === 'string') { if (isPlaceholder(v)) out.push(path); }
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
  };
  for (const k of ['client', 'summary', 'overview', 'critical', 'content', 'aeo', 'geo', 'offpage', 'conversion', 'roadmap', 'closing']) walk(audit[k], k);
  return out;
}

function css() {
  return `
  @page { size: A4; margin: 0; }
  :root { --ink:#14181c; --ink-2:#3b474d; --muted:#5c6b6f; --rule:#d8dedb; --paper:#fff; --panel:#f3f5f6; --accent:#0b7a75; --accent-soft:#dcefed; --gold:#8a6b38; --gold-soft:#f5efe3; --danger:#b3261e; --warn:#9a6700; --ok:#1f7a3d; --pad:16mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "IBM Plex Sans", "Helvetica Neue", Helvetica, Arial, sans-serif; color: var(--ink); background: #e9ecec; font-size: 10.2pt; line-height: 1.5; }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto 8mm; background: var(--paper); padding: var(--pad) var(--pad) 22mm; position: relative; page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  h1, h2, h3 { font-family: "Fraunces", "Iowan Old Style", Georgia, serif; font-weight: 600; color: var(--ink); line-height: 1.15; }
  h2 { font-size: 19pt; margin-bottom: 4mm; padding-bottom: 2mm; border-bottom: 2px solid var(--accent-soft); }
  h3 { font-size: 11.5pt; margin: 6mm 0 2.5mm; }
  p { margin-bottom: 3mm; color: var(--ink-2); }
  p.lead { font-size: 11pt; color: var(--ink); }
  ul, ol { margin: 0 0 4mm 5mm; color: var(--ink-2); } li { margin-bottom: 1.5mm; }
  .eyebrow { font-size: 8pt; letter-spacing: .12em; text-transform: uppercase; color: var(--accent); font-weight: 600; margin-bottom: 2mm; }
  .cover { min-height: calc(297mm - 38mm); display: flex; flex-direction: column; justify-content: space-between; }
  .cover-top { border-top: 3px solid var(--accent); padding-top: 8mm; }
  .cover h1 { font-size: 34pt; margin: 2mm 0 4mm; }
  .cover-sub { font-size: 13pt; color: var(--ink-2); max-width: 85%; margin-bottom: 10mm; }
  .cover-url { display: inline-block; background: var(--accent-soft); color: var(--accent); padding: 2.5mm 4.5mm; border-radius: 4px; font-weight: 600; font-size: 11pt; }
  .cover-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; margin-top: 14mm; padding-top: 6mm; border-top: 1px solid var(--rule); }
  .cover-meta dt { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin-bottom: 1mm; }
  .cover-meta dd { font-size: 11pt; font-weight: 600; }
  .cover-foot { font-size: 8.5pt; color: var(--muted); border-top: 1px solid var(--rule); padding-top: 4mm; }
  .page-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 3mm; margin-bottom: 6mm; border-bottom: 1px solid var(--rule); font-size: 8pt; color: var(--muted); }
  .page-header strong { color: var(--accent); }
  .page-footer { position: absolute; bottom: 9mm; left: var(--pad); right: var(--pad); display: flex; justify-content: space-between; font-size: 8pt; color: var(--muted); border-top: 1px solid var(--rule); padding-top: 2.5mm; }
  .scorecard { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; margin: 5mm 0 6mm; }
  .score { border: 1px solid var(--rule); border-radius: 4px; padding: 3.5mm 4mm; background: #fafbfb; }
  .score .label { font-size: 8pt; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin-bottom: 1.5mm; }
  .score-row { display: flex; align-items: center; justify-content: space-between; gap: 3mm; }
  .score-num { font-family: "Fraunces", Georgia, serif; font-size: 22pt; font-weight: 600; color: var(--accent); line-height: 1; font-variant-numeric: tabular-nums; }
  .score-num.low { color: var(--danger); } .score-num.mid { color: var(--warn); } .score-num.ok { color: var(--ok); }
  .score-note { font-size: 8.5pt; color: var(--muted); flex: 1; text-align: right; }
  .verdict { background: var(--ink); color: #e8ecef; border-radius: 4px; padding: 5mm 6mm; margin: 5mm 0; }
  .verdict p { color: #e8ecef; margin: 0; }
  table { width: 100%; border-collapse: collapse; margin: 3mm 0 5mm; font-size: 9.2pt; }
  th { text-align: left; padding: 2.5mm 3mm; font-size: 7.8pt; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); border-bottom: 2px solid var(--ink); font-weight: 600; }
  td { padding: 2.2mm 3mm; border-bottom: 1px solid var(--rule); vertical-align: top; }
  .status-ok { color: var(--ok); font-weight: 600; white-space: nowrap; } .status-warn { color: var(--warn); font-weight: 600; white-space: nowrap; } .status-bad { color: var(--danger); font-weight: 600; white-space: nowrap; } .status-na { color: var(--muted); }
  .cards { display: grid; gap: 3mm; margin: 4mm 0; }
  .card { border-left: 3px solid var(--danger); background: #fbf1f0; padding: 3.5mm 4mm; border-radius: 0 4px 4px 0; }
  .card.warn { border-left-color: var(--warn); background: #fdf8ee; }
  .card h4 { font-size: 10pt; margin-bottom: 1.5mm; } .card p { font-size: 9.3pt; margin: 0; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
  .callout { background: var(--gold-soft); border-radius: 4px; padding: 4mm 5mm; margin: 4mm 0; border: 1px solid #e8dcc8; }
  .callout p { color: var(--ink); margin: 0; font-size: 9.5pt; }
  .phase { margin-bottom: 5mm; } .phase-head { display: flex; align-items: center; gap: 3mm; margin-bottom: 2.5mm; }
  .badge { background: var(--accent); color: #fff; font-size: 7.8pt; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; padding: 1mm 2.5mm; border-radius: 3px; white-space: nowrap; }
  .phase-title { font-weight: 700; font-size: 10.5pt; }
  .todo { background: #ffe58a; color: #5b4300; padding: 0 .3em; }
  code { font-family: "IBM Plex Mono", Menlo, monospace; font-size: 8.8pt; background: var(--panel); padding: 0 .3em; border-radius: 2px; }
  @media print { body { background: #fff; } .page { margin: 0; } }
  `;
}

const header = (audit, section) => `<div class="page-header"><strong>${esc(audit.client.name)}</strong><span>SEO, AEO and GEO audit · ${esc(section)}</span></div>`;
const footer = (audit, n) => `<div class="page-footer"><span>${esc(audit.client.preparedBy || 'OperStack')} · ${esc(audit.client.reportDate)}</span><span>${n}</span></div>`;
const list = (items) => `<ul>${(items || []).map((i) => `<li>${t(i)}</li>`).join('')}</ul>`;
const olist = (items) => `<ol>${(items || []).map((i) => `<li>${t(i)}</li>`).join('')}</ol>`;
const statusCell = (s) => { const [label, cls] = STATUS[s] || STATUS.na; return `<td class="${cls}">${label}</td>`; };

export function toHtml(audit) {
  const a = audit;
  const groups = [['technical', 'Technical'], ['onpage', 'On-page'], ['content', 'Content'], ['aeo', 'Answer engines'], ['geo', 'Generative engines'], ['overview', 'Overview']];
  const checksBy = (g) => (a.checks || []).filter((c) => c.group === g);
  const scoreCards = Object.entries(a.scores || {}).map(([label, n]) => `<div class="score"><div class="label">${esc(label)}</div><div class="score-row"><span class="score-num ${scoreClass(n)}">${n === null || n === undefined ? 'n/a' : `${n}/10`}</span><span class="score-note">${esc((a.scoreNotes || {})[label] || '')}</span></div></div>`).join('');
  let n = 1;
  const pages = [];
  pages.push(`<div class="page"><div class="cover"><div><div class="cover-top"><div class="eyebrow">Digital marketing audit</div><h1>SEO, AEO and GEO<br>audit report</h1><p class="cover-sub">${t(a.client.subject)}</p><span class="cover-url">${esc(a.meta.host)}</span></div>
    <dl class="cover-meta"><div><dt>Audit subject</dt><dd>${t(a.client.name)}</dd></div><div><dt>Report date</dt><dd>${esc(a.client.reportDate)}</dd></div><div><dt>Audit type</dt><dd>${esc(a.meta.auditType)}</dd></div><div><dt>Prepared by</dt><dd>${esc(a.client.preparedBy || 'OperStack')}</dd></div></dl></div>
    <div class="cover-foot">Public signals were collected by ${esc(a.meta.tool)} on ${esc((a.meta.collectedAt || '').slice(0, 10))}. Every status in this report can be reproduced from the site as it stood on that day.</div></div></div>`);
  n++;
  pages.push(`<div class="page">${header(a, 'Executive summary')}<div class="eyebrow">01 · Summary</div><h2>Executive summary</h2><p class="lead">${t(a.summary.lead)}</p><div class="scorecard">${scoreCards}</div><div class="verdict"><p><strong>Key takeaway:</strong> ${t(a.summary.verdict)}</p></div><h3>Three priorities</h3>${olist(a.summary.priorities)}${footer(a, n++)}</div>`);
  pages.push(`<div class="page">${header(a, 'Site overview')}<div class="eyebrow">02 · Overview</div><h2>What the site is</h2><table><tr><th>Parameter</th><th>Value</th></tr>${(a.overview.rows || []).map(([k, v]) => `<tr><td>${t(k)}</td><td>${t(v)}</td></tr>`).join('')}</table><p>${t(a.overview.note)}</p><h3>Pages sampled</h3><table><tr><th>URL</th><th>Title</th><th>Words</th><th>H1</th><th>Alt</th></tr>${(a.sample || []).filter((p) => p.title !== undefined).slice(0, 14).map((p) => `<tr><td><code>${esc(new URL(p.url).pathname)}</code></td><td>${esc(p.title)}</td><td>${p.words}</td><td>${p.h1Count}</td><td>${p.images ? `${p.images - p.imagesNoAlt}/${p.images}` : '·'}</td></tr>`).join('')}</table>${footer(a, n++)}</div>`);
  const cards = (a.critical || []).map((c, i) => `<div class="card ${c.level === 'warn' ? 'warn' : ''}"><h4>${i + 1}. ${t(c.title)}</h4><p>${t(c.text)}</p></div>`).join('') || '<p>No critical defects were found in the public signals.</p>';
  pages.push(`<div class="page">${header(a, 'Critical issues')}<div class="eyebrow">03 · P0</div><h2>Critical issues, fix first</h2><div class="cards">${cards}</div>${footer(a, n++)}</div>`);
  const techRows = [...checksBy('technical'), ...checksBy('onpage')].map((c) => `<tr><td>${esc(c.label)}</td>${statusCell(c.status)}<td>${esc(c.value)}${c.comment ? `<br><span style="color:var(--muted)">${esc(c.comment)}</span>` : ''}</td></tr>`).join('');
  pages.push(`<div class="page">${header(a, 'Technical SEO')}<div class="eyebrow">04 · Technical</div><h2>Technical and on-page checklist</h2><table><tr><th>Check</th><th>Status</th><th>Finding</th></tr>${techRows}</table>${footer(a, n++)}</div>`);
  pages.push(`<div class="page">${header(a, 'Content and on-page')}<div class="eyebrow">05 · Content</div><h2>Content and on-page SEO</h2><div class="two-col"><div><h3>Strengths</h3>${list(a.content.strengths)}</div><div><h3>Weaknesses</h3>${list(a.content.weaknesses)}</div></div><h3>Structural gaps: pages that do not exist yet</h3>${list(a.content.gaps)}${checksBy('content').length ? `<table><tr><th>Check</th><th>Status</th><th>Finding</th></tr>${checksBy('content').map((c) => `<tr><td>${esc(c.label)}</td>${statusCell(c.status)}<td>${esc(c.value)}</td></tr>`).join('')}</table>` : ''}${footer(a, n++)}</div>`);
  const geoRows = [...checksBy('aeo'), ...checksBy('geo')].map((c) => `<tr><td>${esc(c.label)}</td>${statusCell(c.status)}<td>${esc(c.value)}${c.comment ? `. ${esc(c.comment)}` : ''}</td></tr>`).join('') + (a.geo.rows || []).map(([k, s, d]) => `<tr><td>${t(k)}</td><td>${t(s)}</td><td>${t(d)}</td></tr>`).join('');
  pages.push(`<div class="page">${header(a, 'AEO and GEO')}<div class="eyebrow">06 · AEO / GEO</div><h2>Answer engines: AEO</h2><p class="lead">Whether the site's answers can be lifted into "People also ask", AI overviews, ChatGPT and Perplexity.</p><div class="two-col"><div><h3>What already works</h3>${list(a.aeo.works)}</div><div><h3>What blocks the wins</h3>${list(a.aeo.blocks)}</div></div><div class="callout"><p><strong>Recommendation:</strong> ${t(a.aeo.recommendation)}</p></div><h2>Generative engines: GEO</h2><table><tr><th>Signal</th><th>Status</th><th>Detail</th></tr>${geoRows}</table><div class="callout"><p>${t(a.geo.callout)}</p></div>${footer(a, n++)}</div>`);
  pages.push(`<div class="page">${header(a, 'Off-page, conversion, limitations')}<div class="eyebrow">07 · Off-page</div><h2>Off-page and external presence</h2>${list(a.offpage.listed)}<p>${t(a.offpage.note)}</p><div class="eyebrow" style="margin-top:8mm">08 · Conversion</div><h2>Conversion and UX</h2><table><tr><th>Element</th><th>Status</th></tr>${(a.conversion.rows || []).map(([k, v]) => `<tr><td>${t(k)}</td><td>${t(v)}</td></tr>`).join('')}</table><div class="eyebrow" style="margin-top:8mm">09 · Limitations</div><h2>Audit limitations</h2><p>This report is based on public data only:</p>${list(a.limitations)}${footer(a, n++)}</div>`);
  const phases = (a.roadmap || []).map((p) => `<div class="phase"><div class="phase-head"><span class="badge">${esc(p.badge)}</span><span class="phase-title">${t(p.title)}</span></div>${olist(p.items)}</div>`).join('');
  pages.push(`<div class="page">${header(a, 'Roadmap')}<div class="eyebrow">10 · Roadmap</div><h2>Work plan: priorities and timeline</h2>${phases}<div class="verdict"><p><strong>Key message:</strong> ${t(a.closing)}</p></div>${footer(a, n++)}</div>`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(a.client.name)}: SEO, AEO and GEO audit</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono&display=swap"><style>${css()}</style></head><body>${pages.join('\n')}</body></html>`;
}

function findChrome() {
  const candidates = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean);
  return candidates.find((p) => existsSync(p));
}

export async function render(audit, { out, pdf = false } = {}) {
  const html = toHtml(audit);
  writeFileSync(out, html);
  let pdfPath = null;
  if (pdf) {
    const chrome = findChrome();
    if (!chrome) { console.error('no Chrome found; set CHROME_PATH or open the HTML and print to PDF'); }
    else {
      pdfPath = out.replace(/\.html?$/, '') + '.pdf';
      const profile = mkdtempSync(join(tmpdir(), 'operstack-audit-'));
      const r = spawnSync(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, '--virtual-time-budget=8000', '--no-pdf-header-footer', `--print-to-pdf=${pdfPath}`, `file://${out}`], { encoding: 'utf8', timeout: 90000 });
      rmSync(profile, { recursive: true, force: true });
      if (!existsSync(pdfPath)) { console.error(`Chrome did not write the PDF${r.stderr ? `: ${r.stderr.slice(-300)}` : ''}`); pdfPath = null; }
    }
  }
  return { html, pdf: pdfPath };
}
