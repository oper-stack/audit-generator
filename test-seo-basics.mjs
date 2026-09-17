/** Основы SEO: считаются из прочитанного, на балл ИИ не влияют, называют долю по каждому правилу. */
import assert from 'node:assert/strict';
import { seoBasics } from './src/visibility.mjs';

const T = { seo: { title: 'title', description: 'description', h1: 'h1', canonical: 'canonical', og: 'og', indexable: 'indexable' } };
const good = { title: 'Ровный заголовок про дело', description: 'Описание страницы, в котором сказано, о чём она, и хватает знаков, чтобы это было описанием.', h1: 'Заголовок', canonical: 'https://x/', ogTitle: true, robotsMeta: '' };
const bad = { title: '', description: '', h1: '', canonical: '', ogTitle: false, robotsMeta: 'noindex' };

assert.equal(seoBasics([good, good], T).score, 100);
assert.equal(seoBasics([bad, bad], T).score, 0);
const half = seoBasics([good, bad], T);
assert.equal(half.score, 50, 'половина страниц в порядке даёт 50');
assert.equal(half.checks.length, 6);
assert.deepEqual(half.checks.find((c) => c.id === 'h1'), { id: 'h1', label: 'h1', passed: 1, total: 2 });
assert.equal(seoBasics([], T).score, null, 'нет страниц, нет числа');
assert.equal(seoBasics([{ ...good, title: 'x'.repeat(90) }], T).checks[0].passed, 0, 'слишком длинный заголовок не проходит');
console.log('основы SEO: семь проверок пройдено');
