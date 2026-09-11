# Changelog

## 0.7.1

### Fixed
- **`operstack-audit` with no arguments listed three commands of six.** `fix-plan`, `fix-report` and `foundation-scope` existed only in the source header, so nobody running the tool could find them. The usage block now names every command with its flags and one line on what it does.
- `package.json` is exported, so tooling that reads a dependency's version no longer fails on the exports map.

## 0.7.0

### Added
- **Foundation is scoped per page, not guessed.** `foundation-scope` reads the sampled pages and lists, for each one, the text work it needs: an opening that answers with a figure, sources beside the figures, sections, a table worth quoting, or a rewrite when the page is empty. Out come the scope as JSON, a letter the client agrees to, and a checklist.
- **The price is arithmetic.** One share is the unit of work on a page: three shares to write a page from scratch or fix four or more defects, two for two or three, one for a single edit. Shares times the unit price, lifted to the package minimum. Defaults: 50 USD / 4200 RUB a share, minimum 500 USD / 42000 RUB. `--new-pages N` adds pages that do not exist yet at three shares each.
- **Utility pages never enter a scope.** Privacy policies, terms, contact and the like, in both Latin and Russian slugs, are excluded and counted separately, and the letter says why. Nobody rewrites a privacy policy to open with a figure.
- **Sources are only asked for where figures exist.** The collector now counts paragraphs carrying a digit, so a page with no numbers is never billed for naming their sources.
- **The letter is honest about what it cannot see.** Without Search Console access the scope is built on a sitemap sample, and the letter says so and asks for the free read-only access that would let us scope on the pages that already earn impressions.
- Both languages, same as the Fix letters.

### Changed
- `collect` keeps the text fields in `sample`: `answerFirst`, `sourcePhrases`, `citedParagraphs`, `figureParagraphs`, `h2Count`, `tables`, `firstParaWords`, `dates`. They were computed and thrown away, which is why Foundation could not be priced from an audit. No check logic changed.

## 0.6.0

### Added
- **The Fix package has a process, not just a price.** `fix-plan` reads an audit and splits every open check into what we close ourselves, what needs the client's own facts, and what we do not promise at all, with a named action for each of the 44 checks the collector can raise. It writes the plan as JSON, a letter the client agrees to before paying, and a checklist for the executor.
- **The refund is arithmetic, not a judgement call.** The price is divided by the number of checks in the agreed list, so an unclosed check has a known share. `fix-report` compares a later run against the plan and prints what closed, what did not, and the sum to refund. A check missing from the later run counts as not closed.
- **`--platform cms`** moves the checks that need source access into "not promised" instead of promising them on a hosted site builder.
- **Both letters exist in both languages.** `--lang ru|en` writes the client letter, the checklist and the report in the buyer's language; the price defaults to 249 USD in English and 21000 RUB in Russian. A Russian letter translates the check names from an English audit itself; an English letter over a Russian audit is refused, because half-translated is worse than re-collecting.
- **The letter argues against the sale when the sale is poor.** Below five closable checks it says so and points at the alternative; with none it says there is nothing to buy.

### Note
- 42 tests in `src/test-fix.mjs`, including a coverage test asserting every check id a real audit produces has a fix action. Nothing in the collector or the renderer was touched.

## 0.5.0

### Added
- **`collect` speaks Russian.** `--lang ru` (or `{ lang: 'ru' }`) returns every check label, value and comment in Russian, with correct declension for counts. Scores are computed before the translation, so language cannot move a number.
- `localiseChecks`, `localiseBasisNote`, `untranslated` and `AREAS_RU` are exported, from the package root and from `@operstack/audit/i18n`. `untranslated(checks)` lists any check the dictionary does not cover, so a gap shows up instead of silently staying English.
- `computeScores`, `verifyScores` and `SCORE_AREAS` are now exported from the package root too.

### Note
- The translation is a layer on top of the collector: no check logic was touched, and `lang: 'en'` returns exactly what it returned before. Verified on 78 real checks from two sites: full coverage, no English left in Russian output, every figure preserved.

## 0.4.0

### Added
- **The report renders in Russian.** Set `meta.lang` to `ru` in `audit.json` and every heading, column, status word, section name and footnote comes out in Russian, including the six area names and the evidence line under each score, which declines the word for "check" correctly. English stays the default and is unchanged.

### Note
- `collect` still writes check labels and values in English. A Russian report needs those rows translated in the JSON before rendering; the tool's own chrome is handled.

## 0.3.3

### Fixed
- **The contact, about and policy pages are read first.** They were left to the luck of sitemap order, so a 44 page site sampled 20 deep reported "no messenger, no contact page and no about page" while all three sat in the sitemap, unread. The pages the trust and conversion checks exist to look at are now always in the sample.
- **A call to action is more than "contact us".** A link that says order, buy, get started, check your site, or points at an audit or pricing page is a call to action too. The check was counting only the words a support page uses.

## 0.3.2

### Fixed
- **A citation was only recognised in words.** A paragraph that names a source properly, with an outbound link beside the figure it backs, did not count. It does now. Found on a corpus that cites Harvard Business Review and MIT with links on nearly every page and was scored as naming no sources at all.
- **A messenger is a direct contact channel.** The contact check counted only a phone and an email, so a business that answers on Telegram all day read as unreachable. Any two published channels of phone, email and messenger now pass.

## 0.3.1

### Fixed
- A honeypot, the invisible field a form uses to catch spam bots, was counted as a field the visitor has to fill. Inputs hidden from people (`tabindex="-1"`, an `aria-hidden` ancestor, a honeypot class or name, a container hidden in CSS) no longer count. Found by running the tool against our own site, where it inflated a four-field form to six.

## 0.3.0

### Added
- **Off-page and trust is measured**, from the site alone and for free: a postal address in the structured data, published phone and email, `sameAs` profiles claimed on other hosts, an about page, privacy and terms.
- **Conversion is measured**, also from the site alone: whether every page offers a way to get in touch, whether a call to action sits in the first screen, how far down the first form sits, how many fields it asks for, whether a messenger link exists. Behaviour still needs analytics; the contact path does not.
- Section 09 of the report is now a **sources table**: every source, whether it is free, needs a free account, or costs money, and what was read from it.
- `--backlinks links.json` passes a backlink profile in from any tool.

### Changed
- **No number that costs money moves a score.** Backlink data is printed as a note and counted in nothing, so anyone can re-run the audit for free and get the same figures. Search Console and Bing Webmaster are free but need the owner's own account, so they feed the narrative and no score.
- A `sameAs` pointing at the audited site itself is no longer counted as a profile somewhere else.

## 0.2.0

### Fixed
- **Scores are computed, never typed.** The scorecard on page 2 is rendered from the collected checks every time the report is built. A number written by hand into `audit.json` is ignored, and `operstack-audit check` and `render` both name it. Before this, any figure an analyst typed was printed as a measurement.
- **Areas the audit does not measure are printed as "not measured".** Off-page and trust has no backlink tool behind it and Conversion and UX has no analytics behind it, so neither is scored. They used to accept a number like any other area.
- **Critical issues print their body.** Cards written with `cost` and `fix` rendered as bare headlines, because the template only read `text`. All three fields now render, and `check` fails on an issue with no body at all.
- Every score card carries the count it came from, for example "3 of 5 checks pass, 2 need attention", so the reader can recompute it from the checklist.

### Added
- Answer-first checks, the same measures the free AI visibility check uses, so the two products agree: an answer-first opening paragraph with a figure, three or more H2 sections, a table in the content, and a named source next to a figure. AEO rests on five checks instead of two.
- AI crawler access is split in two: a blocked **search fetcher** is a defect and is scored, a blocked **training crawler** is a policy choice and is reported without a score.
- `computeScores`, `verifyScores` and `SCORE_AREAS` are exported. `suggestScores` still works and is deprecated.
- `npm test` runs the scoring tests in `src/test-scores.mjs`.

## 0.1.0 (2026-09-10)

First public release.

- `collect <url>`: public signals of a site into audit.json: HTTPS, www canonicalisation, time to first byte, robots.txt per user agent, sitemaps, llms.txt, homepage and sampled pages (titles, descriptions, H1, alt coverage, canonical, viewport, Open Graph, JSON-LD types, dates, word counts, duplicate titles, thin pages, utility pages), suggested scores.
- `check <audit.json>`: lists narrative fields still holding placeholders.
- `render <audit.json> [--pdf]`: ten-page print-ready report, PDF through headless Chrome.
- Fictional sample audit in `examples/`.
