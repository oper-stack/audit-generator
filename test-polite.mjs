/**
 * Вежливое чтение: пауза, Crawl-delay и остановка на отказах.
 * Проверяем не «работает ли», а что сайт, который просит притормозить, получает паузу,
 * и что неразумный Crawl-delay упирается в потолок, а не превращает аудит в час ожидания.
 */
import assert from 'node:assert/strict';
import { crawlDelayFrom } from './src/collect.mjs';

assert.deepEqual(crawlDelayFrom(''), { ms: 0, asked: 0, capped: false });
assert.deepEqual(crawlDelayFrom('User-agent: *\nDisallow:'), { ms: 0, asked: 0, capped: false });
assert.deepEqual(crawlDelayFrom('User-agent: *\nCrawl-delay: 2'), { ms: 2000, asked: 2000, capped: false });
assert.deepEqual(crawlDelayFrom('Crawl-delay: 0.5'), { ms: 500, asked: 500, capped: false });
// Потолок: сайт просит полминуты на страницу, мы столько ждать не можем и говорим об этом.
const big = crawlDelayFrom('Crawl-delay: 30');
assert.equal(big.ms, 3000); assert.equal(big.asked, 30000); assert.equal(big.capped, true);
// Несколько блоков: берём самое строгое требование, а не первое попавшееся.
assert.equal(crawlDelayFrom('User-agent: a\nCrawl-delay: 1\nUser-agent: b\nCrawl-delay: 2').ms, 2000);
// Мусор не ломает разбор.
assert.equal(crawlDelayFrom('Crawl-delay: soon').ms, 0);
console.log('вежливое чтение: семь проверок пройдено');
