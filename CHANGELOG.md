# Changelog

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
