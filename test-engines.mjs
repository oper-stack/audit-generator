/**
 * Готовность по движкам: проверяем не «работает ли», а что число падает у ТОГО движка, чьего
 * робота закрыли, и не падает у соседей. И что формула та же, что у общего балла: у сайта,
 * который никого не закрыл, число движка обязано совпасть с баллом.
 */
import assert from 'node:assert/strict';
import { engineReadiness } from './src/visibility.mjs';

const T = { area: { access: 'Доступ', index: 'Карта', entity: 'Разметка', content: 'Цитата', trust: 'Доверие' } };
const AGENTS = ['oai-searchbot','chatgpt-user','perplexitybot','perplexity-user','claude-searchbot','claude-user','google-extended','bingbot'];
const make = (blocked = []) => AGENTS.map((agent) => ({ agent, label: agent, labelRu: agent, kind: 'search', verdict: blocked.includes(agent) ? 'blocked' : 'allowed' }));
const full = { access: null, index: 1, entity: 1, content: 1, trust: 1 };

// Всё открыто и всё хорошо: у всех сто, как и общий балл.
for (const e of engineReadiness(make(), full, T)) assert.equal(e.score, 100, `${e.label} при полном доступе обязан дать 100`);

// Закрыли оба робота ChatGPT: падает только он, ровно на вес доступа из общего балла.
const noGpt = Object.fromEntries(engineReadiness(make(['oai-searchbot', 'chatgpt-user']), full, T).map((e) => [e.id, e]));
assert.equal(noGpt.chatgpt.score, 75, 'доступ весит 25 пунктов, как и в балле');
assert.equal(noGpt.perplexity.score, 100, 'у соседа число не двигается');
assert.equal(noGpt.chatgpt.blocked.length, 2);

// Один робот из двух: доступ считается долей.
assert.equal(engineReadiness(make(['oai-searchbot']), full, T).find((e) => e.id === 'chatgpt').score, 88);

// Область не измерена: её вес делится между остальными, а не превращается в ноль.
for (const e of engineReadiness(make(), { ...full, content: null }, T)) assert.equal(e.score, 100, 'неизмеренное не считается в минус');

// Разные движки при одинаковых условиях дают одинаковое число: формула одна.
const same = engineReadiness(make(), { access: null, index: 1, entity: 0.8, content: 0.6, trust: 0.4 }, T);
assert.equal(new Set(same.map((e) => e.score)).size, 1, 'при одинаковом доступе все движки обязаны совпасть');

// Слабое место называется, и это не доступ: про него сказано отдельно.
assert.equal(engineReadiness(make(), { access: null, index: 1, entity: 1, content: 0.4, trust: 0.9 }, T)[0].weakest, 'Цитата');

// robots.txt не прочитан: доступ не считается вовсе.
const unknown = AGENTS.map((agent) => ({ agent, label: agent, labelRu: agent, kind: 'search', verdict: 'unknown' }));
for (const e of engineReadiness(unknown, full, T)) assert.equal(e.score, 100, 'непрочитанный robots.txt не наказывает');

// Под числом стоит факт: чьих роботов спросили.
assert.equal(engineReadiness(make(), full, T)[0].how, 'oai-searchbot, chatgpt-user');

console.log('готовность по движкам: восемь проверок пройдено');
