/**
 * The rule this file exists to defend: no number in a report is typed by a human.
 * Every score is computed from the collected checks, and an area with no checks is
 * printed as "not measured" rather than scored on an impression.
 */
import { computeScores, verifyScores, SCORE_AREAS } from './collect.mjs';
import { toHtml, checkNarrative } from './render.mjs';

let failed = 0;
const is = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) { failed++; console.error(`FAIL ${name}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`); }
  else console.log(`ok   ${name}`);
};
const ok = (name, cond) => is(name, Boolean(cond), true);

const checks = [
  { group: 'technical', status: 'ok' }, { group: 'technical', status: 'ok' },
  { group: 'technical', status: 'warn' }, { group: 'technical', status: 'na' },
  { group: 'aeo', status: 'bad' }, { group: 'aeo', status: 'ok' },
];
const { scores, scoreBasis } = computeScores(checks);

is('ok 1, warn 0.5, bad 0, na ignored', scores['SEO, technical'], 8);
is('an area with half its checks failing scores 5', scores['AEO, answers and snippets'], 5);
is('na is not counted', scoreBasis['SEO, technical'].counted, 3);
is('an area with no checks is not measured', scores['Off-page and trust'], null);
is('and says why', scoreBasis['Off-page and trust'].note, 'not measured: this audit collected no check in this area');
is('conversion is not measured either', scores['Conversion and UX'], null);
is('every area is accounted for', Object.keys(scores).length, SCORE_AREAS.length);
is('the basis is printable evidence', scoreBasis['AEO, answers and snippets'].note, '1 of 2 checks pass, 1 fails');

// an area is scored as soon as its checks are collected, and only then
const withOffpage = computeScores([
  ...checks,
  { group: 'offpage', status: 'ok' }, { group: 'offpage', status: 'warn' }, { group: 'offpage', status: 'na' },
  { group: 'conversion', status: 'bad' }, { group: 'conversion', status: 'ok' },
]);
is('off-page is scored from its own checks', withOffpage.scores['Off-page and trust'], 8);
is('and the na row is not counted', withOffpage.scoreBasis['Off-page and trust'].counted, 2);
is('conversion is scored from its own checks', withOffpage.scores['Conversion and UX'], 5);
is('an area with checks is never "not measured"', withOffpage.scoreBasis['Conversion and UX'].note, '1 of 2 checks pass, 1 fails');

const typed = { checks, scores: { 'SEO, technical': 2, 'Off-page and trust': 6, 'Made-up area': 9 } };
const problems = verifyScores(typed);
ok('a typed score is caught', problems.some((p) => p.startsWith('SEO, technical:')));
ok('a score for an unmeasured area is caught', problems.some((p) => p.startsWith('Off-page and trust:')));
ok('an invented area is caught', problems.some((p) => p.includes('not one of the six audit areas')));
is('a report that matches its checks has no problems', verifyScores({ checks, scores }), []);

const audit = {
  meta: { host: 'example.com', collectedAt: '2026-09-11T00:00:00.000Z', tool: 'test', auditType: 'test' },
  client: { name: 'Example', subject: 'test', reportDate: '2026-09-11' },
  scores: { 'SEO, technical': 2, 'Off-page and trust': 2 },
  checks,
  summary: { lead: 'x', verdict: 'x', priorities: ['x'] },
  overview: { rows: [['a', 'b']], note: 'x' },
  critical: [{ title: 'An issue with no text', cost: 'what it costs', fix: 'how to fix it' }, { title: 'A bare headline' }],
  content: { strengths: ['x'], weaknesses: ['x'], gaps: ['x'] },
  aeo: { works: ['x'], blocks: ['x'], recommendation: 'x' },
  geo: { rows: [['a', 'b', 'c']], callout: 'x' },
  offpage: { listed: ['x'], note: 'x' },
  conversion: { rows: [['a', 'b']] },
  limitations: ['x'], roadmap: [{ badge: 'w', title: 't', items: ['x'] }], closing: 'x', sample: [],
};
const html = toHtml(audit);
ok('the report prints the computed score, not the typed one', html.includes('8/10'));
ok('the typed 2/10 never reaches the page', !html.includes('>2/10<'));
ok('an unmeasured area says so', html.includes('not measured'));
ok('the scorecard shows the count it came from', html.includes('2 of 3 checks pass'));
ok('a critical issue prints what it costs and how to fix it', html.includes('What it costs') && html.includes('how to fix it'));
ok('a critical issue with no body is reported', checkNarrative(audit).some((m) => m.startsWith('critical[1].text')));

if (failed) { console.error(`\n${failed} test(s) failed`); process.exit(1); }
console.log('\nall scoring tests pass');
