/**
 * Сколько текста страницы не видит тот, кто не выполняет JavaScript.
 *
 * Человеческими словами: если сайт рисует себя скриптами, то поисковый робот и особенно робот,
 * который достаёт страницу для ответа ИИ, могут увидеть пустую страницу. Владелец при этом видит
 * полный текст и не понимает, почему его не цитируют. Здесь это измеряется прямо: страница
 * читается дважды, как обычный запрос без скриптов и как настоящий браузер, и считается, какая
 * доля текста появляется только во втором случае.
 *
 * Браузер берётся тот же, которым печатается PDF отчёта: свой Chrome или Chromium. Если его нет,
 * проверка не выдумывает результат, а говорит, что не измеряла, и почему.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Тот же поиск браузера, что у печати PDF: одна привычка на весь пакет. */
export function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  for (const c of candidates) {
    const r = spawnSync(c, ['--version'], { encoding: 'utf8', timeout: 8000 });
    if (r.status === 0) return c;
  }
  return null;
}

/** Текст страницы после выполнения скриптов. null, если браузера нет или он не справился. */
export function renderedDom(url, { chrome = null, timeoutMs = 45000, waitMs = 8000 } = {}) {
  const bin = chrome || findChrome();
  if (!bin) return null;
  const profile = mkdtempSync(join(tmpdir(), 'operstack-render-'));
  try {
    const r = spawnSync(bin, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--disable-extensions', '--mute-audio', '--hide-scrollbars',
      `--user-data-dir=${profile}`, `--virtual-time-budget=${waitMs}`, '--dump-dom', url,
    ], { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0 || !r.stdout) return null;
    return r.stdout;
  } catch { return null; } finally { rmSync(profile, { recursive: true, force: true }); }
}

const CHROME_STRIP = /<(nav|footer|aside|script|style|noscript|template)[\s\S]*?<\/\1>/gi;
const plain = (html) => String(html)
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(CHROME_STRIP, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const countWords = (s) => (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;

/**
 * Сравнение двух чтений одной страницы.
 * @returns {{raw:number, rendered:number, hiddenShare:number, verdict:'ok'|'warn'|'bad'}}
 */
export function compareReadings(rawHtml, renderedHtml) {
  const raw = countWords(plain(rawHtml));
  const rendered = countWords(plain(renderedHtml));
  // Отрицательной разницы не бывает: если браузер увидел меньше, значит он не досчитал, а не
  // страница уменьшилась. Такой случай считаем нулевой разницей, а не отрицательной долей.
  const extra = Math.max(0, rendered - raw);
  const hiddenShare = rendered > 0 ? Math.round((extra / rendered) * 100) : 0;
  const verdict = hiddenShare >= 40 || (raw < 50 && rendered >= 200) ? 'bad' : hiddenShare >= 10 ? 'warn' : 'ok';
  return { raw, rendered, hiddenShare, verdict };
}

const WORD = { ru: (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'слово' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'слова' : 'слов'}` };

/** Строка проверки для аудита. Текст пишется так, чтобы владелец понял, чем ему это грозит. */
export function jsBlindnessCheck(pages, lang = 'en') {
  const measured = pages.filter((p) => p && p.rendered > 0);
  if (!measured.length) {
    return {
      id: 'js-content', group: 'technical',
      label: lang === 'ru' ? 'Виден ли текст без выполнения скриптов' : 'Text visible without running JavaScript',
      status: 'na',
      value: lang === 'ru' ? 'не измеряли: на этой машине нет браузера Chrome или Chromium' : 'not measured: no Chrome or Chromium on this machine',
      comment: lang === 'ru' ? 'проверка сравнивает страницу, прочитанную без скриптов, с ней же в настоящем браузере' : 'the check compares the page read without scripts against the same page in a real browser',
    };
  }
  const worst = measured.slice().sort((a, b) => b.hiddenShare - a.hiddenShare)[0];
  const median = measured.map((p) => p.hiddenShare).sort((a, b) => a - b)[Math.floor(measured.length / 2)];
  const status = measured.some((p) => p.verdict === 'bad') ? 'bad' : measured.some((p) => p.verdict === 'warn') ? 'warn' : 'ok';
  const value = lang === 'ru'
    ? `без скриптов видно всё, кроме ${median} процентов текста (медиана по ${measured.length} ${measured.length === 1 ? 'странице' : 'страницам'}), хуже всего ${worst.url}: там скрыто ${worst.hiddenShare} процентов, ${WORD.ru(worst.raw)} без скриптов против ${WORD.ru(worst.rendered)} в браузере`
    : `${median}% of the text is invisible without JavaScript (median over ${measured.length} page${measured.length === 1 ? '' : 's'}); worst is ${worst.url} at ${worst.hiddenShare}%, ${worst.raw} words without scripts against ${worst.rendered} in a browser`;
  // Слова по размеру беды: на четырнадцати процентах писать «страница почти пустая» это враньё
  // в ту же сторону, от которого мы уходим.
  const comment = status === 'ok'
    ? (lang === 'ru' ? 'страницы читаются целиком и без браузера, это то, что нужно поиску и ИИ' : 'the pages read whole without a browser, which is what search and AI need')
    : status === 'bad'
      ? (lang === 'ru' ? 'для простых роботов поиска и для роботов, которые достают страницу в ответ ИИ, эта страница почти пустая: они не выполняют скрипты' : 'to simple search crawlers and to the fetchers that pull a page into an AI answer this page is nearly empty: they do not run scripts')
      : (lang === 'ru' ? 'эта часть текста не доходит до роботов, которые не выполняют скрипты, а именно они приносят страницу в ответ ИИ' : 'this part of the text does not reach the robots that do not run scripts, and those are the ones that bring a page into an AI answer');
  return { id: 'js-content', group: 'technical', label: lang === 'ru' ? 'Виден ли текст без выполнения скриптов' : 'Text visible without running JavaScript', status, value, comment };
}
