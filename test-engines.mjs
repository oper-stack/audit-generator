/**
 * Готовность по движкам: проверяем не «работает ли», а что число падает у ТОГО движка, чьего
 * робота закрыли, и не падает у соседей. Именно это отличает честное число от нарисованного.
 */
import assert from 'node:assert/strict';
import { engineReadiness } from './src/visibility.mjs';

const T = { area: { access: 'Доступ', entity: 'Разметка', content: 'Цитата', trust: 'Доверие' }, engineLive: 'живьём', engineIndex: 'из индекса' };
const AGENTS = ['oai-searchbot','chatgpt-user','perplexitybot','perplexity-user','claude-searchbot','claude-user','google-extended','bingbot'];
const make = (blocked = []) => AGENTS.map((agent) => ({ agent, label: agent, labelRu: agent, kind: 'search', verdict: blocked.includes(agent) ? 'blocked' : 'allowed' }));
const full = { access: null, entity: 1, content: 1, trust: 1 };

// Всё открыто и всё хорошо: у всех сто.
const all = engineReadiness(make(), full, T);
assert.equal(all.length, 5);
for (const e of all) assert.equal(e.score, 100, `${e.label} при полном доступе обязан дать 100`);

// Закрыли оба робота ChatGPT: падает только он.
const noGpt = engineReadiness(make(['oai-searchbot', 'chatgpt-user']), full, T);
const byId = Object.fromEntries(noGpt.map((e) => [e.id, e]));
assert.equal(byId.chatgpt.score, 55, 'ChatGPT без своих роботов теряет ровно вес доступа');
assert.equal(byId.perplexity.score, 100, 'у соседа число не двигается');
assert.equal(byId.chatgpt.blocked.length, 2);

// Закрыли одного из двух: доступ считается долей.
const half = engineReadiness(make(['oai-searchbot']), full, T);
assert.equal(half.find((e) => e.id === 'chatgpt').score, 78, 'один робот из двух это половина веса доступа');

// Область не измерена: её вес делится между остальными, а не превращается в ноль.
const noContent = engineReadiness(make(), { access: null, entity: 1, content: null, trust: 1 }, T);
for (const e of noContent) assert.equal(e.score, 100, 'неизмеренное не считается в минус');

// Слабое место называется, и это не доступ: про него сказано отдельно.
const weak = engineReadiness(make(), { access: null, entity: 1, content: 0.4, trust: 0.9 }, T);
assert.equal(weak[0].weakest, 'Цитата');

// Робот неизвестен (robots.txt не прочитан): доступ не считается вовсе.
const unknown = AGENTS.map((agent) => ({ agent, label: agent, labelRu: agent, kind: 'search', verdict: 'unknown' }));
for (const e of engineReadiness(unknown, full, T)) assert.equal(e.score, 100, 'непрочитанный robots.txt не наказывает');

console.log('готовность по движкам: шесть проверок пройдено');
