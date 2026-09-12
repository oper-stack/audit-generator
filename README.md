# @operstack/audit

The SEO, AEO and GEO audit generator behind the OperStack audit service. It collects the public signals of a site into one JSON file, leaves the narrative to an analyst or an agent, and renders a print-ready report.

```
npx @operstack/audit collect https://example.com --pages 20 --out audit.json
npx @operstack/audit check audit.json
npx @operstack/audit render audit.json --pdf
```

## What `collect` gathers

Everything an external auditor can see without Search Console or analytics access:

- HTTPS, www canonicalisation, time to first byte on the homepage.
- robots.txt, the sitemap it names (or the usual paths), the URL count, foreign hosts in the sitemap, sitemap URLs that redirect or break.
- llms.txt: present, text or HTML, and whether its links point at the site or somewhere else.
- Off-page and trust, from the site itself: the postal address in the structured data, published phone and email, `sameAs` profiles claimed on other hosts, an about page, privacy and terms.
- The conversion path: whether every page offers a way to get in touch, whether a call to action sits in the first screen, how far down the page the first form sits, how many fields it asks for, and whether a messenger link exists.
- The homepage and a sample of pages from the sitemap: title and description lengths, shortcodes or encoded data in the description, H1 count, alt coverage, canonical, robots meta, viewport (zoom blocked), Open Graph and Twitter cards, JSON-LD types (FAQPage, Organization and business types), script and stylesheet counts, hreflang, exposed dates, word counts, duplicate titles, thin pages, utility pages in the index, and on WordPress the xmlrpc endpoint.

Every finding becomes a row with a status (`ok`, `warn`, `bad`, `na`), a value and a comment. `bad` rows are copied into the critical-issues page automatically.

**Scores are computed, never typed.** The six area scores on page 2 are rendered from the checks each time the report is built: a check that passes counts one, a check that needs attention a half, a failing check nothing, and `na` is ignored. A number written by hand into `audit.json` is ignored and named by `operstack-audit check`. An area with no checks is printed as **not measured** rather than scored, so nothing rests on an impression. Each card also shows the count it came from, so a reader can recompute it from the checklist.

## What you need to run this

**Nothing. No account, no key, no subscription.** `collect` reads the site the way any visitor reads it, and every score in the report is computed from that. Two people auditing the same site on the same day get the same numbers.

Two things are optional, and the report always says which was used:

| Optional | Cost | What it adds |
|---|---|---|
| Google Search Console and Bing Webmaster Tools | Free, but you need your own free account and a verified site | Impressions, clicks, positions and the real queries. These go into the narrative; no score depends on them. |
| A backlink tool, passed in with `--backlinks links.json` | Paid, and never required | One row with the referring domain count and authority score, printed as a note. **It is not counted in any score**, so the report stays reproducible without it. |

The rule: **if a number costs money to obtain, it does not move a score.** Section 09 of every report prints the sources table so the reader can see exactly what was used and what it cost.

## What the analyst writes

`check` lists every narrative field still holding a `{{placeholder}}`: the client name and subject, the executive summary and verdict, three priorities, the overview note, content strengths and gaps, the AEO and GEO commentary, off-page, conversion rows, the roadmap and the closing message. The rendered report highlights any placeholder in yellow so a draft cannot ship by accident.

An agent can fill these fields from the JSON: the Claude Code plugin `operstack-seo` reads `audit.json`, writes the narrative and calls `render`.

## What `render` produces

Ten A4 pages: cover, executive summary with a scorecard, site overview with the sampled pages, critical issues, technical and on-page checklist, content and structure, AEO and GEO, off-page and conversion and limitations, roadmap in three phases, closing message. HTML always; PDF with `--pdf` when Chrome or Chromium is installed (`CHROME_PATH` overrides the lookup).

## The agent surface

**In plain words.** Assistants like ChatGPT and Claude are starting to read a couple of small files
to work out what a site is and what it can do, the way a search engine reads robots.txt. Almost
nobody has them yet, which is exactly why having them is cheap and noticeable. These checks say
whether yours exist, and they are honest about it being early days: a missing file is a note, not a
failure.

**What it checks.** `/.well-known/agent.json` (the agent card: who you are, what you offer, how to
reach you), `/.well-known/api-catalog` per RFC 9727, and whether a page offers a markdown version,
either through a `Link` header or as a file beside it. The API catalogue is deliberately never
offered as work: it belongs to a business that actually exposes an API.

## What an AI does not see: the JavaScript check

**In plain words.** Some sites draw themselves with scripts. A person opens the page and sees the
full text; a robot that does not run scripts sees an empty frame. The robots that pull a page into
an AI answer are exactly that kind of robot. So the owner reads his own page, sees plenty of text,
and cannot understand why nobody quotes it. This check reads the page twice, as a plain request and
in a real browser, and tells you how much of the text only exists in the second reading.

**What it does.** `collect` runs Chrome or Chromium over the homepage and two sampled pages, strips
the navigation and footer from both readings, and compares the word counts. Forty percent hidden, or
a page that is nearly empty without scripts, fails. Ten to forty warns. Under ten passes. With no
browser installed the check says it was not measured and why. `--no-rendered` skips it,
`--rendered-pages N` changes how many pages are opened; each page costs roughly half a minute.

## Writing the report: `draft`

**If you have never done SEO, start here.** An audit tells you what a search engine and an AI see when they open your site. This tool writes that report for you. It does not guess anything about your business: every sentence in it comes from something that was measured on your pages, and where nothing could be measured it says so instead of filling the gap with words. You read it, correct what only you know, and send it.

```
npx @operstack/audit collect https://example.com --out audit.json
npx @operstack/audit draft audit.json --lang en
npx @operstack/audit render audit.json --pdf
```

Technically: `draft` fills the narrative fields (`summary`, `client.subject`, `overview.note`, `content`, `aeo`, `geo`, `offpage`, `conversion`, `roadmap`, `closing`) from the collected checks. Priorities and roadmap items are written as actions, taken from the same table the Fix checklist uses, so a finding and the work that closes it read the same. Fields an analyst has already written are left alone; anything still empty is listed at the end. For a Russian report over an English audit, check and area names are translated first.

## Handing the work to an AI agent: `prompts`

**If you do not edit the site yourself.** Most people who read an audit now fix their site by telling an AI assistant what to do. This turns every finding into a task written for that assistant: copy it, paste it into Cursor or Claude Code, and it does the work. Each task says what the state is today, what to change, and how you will know it is finished, so the assistant cannot wander off and cannot quietly invent facts about your business.

```
npx @operstack/audit prompts audit.json --lang en --limit 3
```

Technically: every open check is rendered as a Markdown block with `Now` (the measured value), `Task` (the action and its boundaries) and `How to check` (the acceptance test), plus a standing rule against inventing business facts. Twenty checks carry text written for that specific finding; the rest fall back to the Fix action with a generic acceptance test. `--limit 3` is what the free tier hands out; the full list ships with the paid audit. `renderFixChecklist(plan, { withPrompts: true })` embeds the same tasks in the executor checklist.

## The Fix package: turning findings into agreed work

An audit says what is wrong. `fix-plan` says what we will do about it, before anyone pays.

```
npx @operstack/audit fix-plan audit.json --lang en --platform files --price 249
npx @operstack/audit fix-report audit-fix-plan.json after.json
```

Every open check is sorted into one of three buckets by whose knowledge it needs, not by how hard it is:

| Bucket | Meaning |
|---|---|
| We close it | Standard work: markup, redirects, robots, sitemap, titles, contact paths. |
| We need your facts | Text work: an answer-first paragraph, the source behind a figure, thin pages. Foundation does this, priced separately. |
| Not promised | Out of our hands (TLS, hosting response time) or behind paid data (link profile). Never charged for. |

`fix-plan` writes three files: the plan as JSON, a letter the client agrees to before paying, and a checklist for whoever does the work. The price is divided by the number of checks in the list, so one unclosed check has a known refund. `--platform cms` moves the checks that need source access out of the list instead of promising them on a hosted site builder. When fewer than five checks are left to close, the letter says plainly that the package is poor value here and points at the alternative.

`fix-report` re-runs the comparison after the work: what closed, what did not, and the exact sum to refund. A check that vanished from the later run counts as not closed.

Both read the language from the audit: a Russian letter translates the check names itself, and an English letter over a Russian audit is refused rather than sent half-translated.

## The Foundation package: pricing the writing

Fix closes what needs no knowledge of the business. Everything else is text, and text is priced per page.

```
npx @operstack/audit foundation-scope audit.json --lang en --new-pages 3
```

Each sampled page is read for five things: does it open with an answer carrying a figure, are the figures sourced, is it broken into sections, does it carry a table worth quoting, and is there enough of it at all. A page needing one edit is one share of work, two or three defects is two, four or more (or an empty page) is three, and a page that does not exist yet is three. Shares times the unit price, lifted to the package minimum.

The letter states the scope and the shares; `--price` adds the money, because a short page is sometimes short on purpose and an automatic invoice for rewriting it is an invoice for work that should not happen. Utility pages are excluded and counted separately: nobody rewrites a privacy policy to open with a figure. Sources are asked for only where the page actually carries figures. Without Search Console access the scope is built on a sitemap sample, and the letter says so rather than implying we picked the pages that matter.

## Example

`examples/sample-audit.json` is a complete, fictional audit of "Example Villas". `npm run sample` renders it to HTML and PDF next to the JSON.

## Limits

The external tier reads public pages only. It does not run a lab performance test and does not see impressions or conversions. Conversion is scored on the contact path the pages offer, which is measurable from the HTML, not on visitor behaviour, which is not. Reviews and press are not read at all, and the report says so rather than guessing.

## License

MIT. Built by OperStack.

## Agency plan

Signing a report with someone else's name is free:

```
operstack-audit render audit.json --by "Harper & Vale Digital"
```

The cover and every page footer then carry that name. The cover keeps one line saying which tool
collected the signals, so the report still shows its method.

The agency plan replaces that with the buyer's own identity and adds bulk runs:

```
operstack-audit batch clients.txt --by "Harper & Vale Digital" \
  --logo brand/logo.svg --color "#7b3fa0" --no-tool-line --pdf
```

`clients.txt` holds one site per line, either `example.com` or `example.com, Client Name`. Every
report lands in `reports/`, and a site that fails does not stop the rest.

The key goes in `--licence`, in `OPERSTACK_LICENCE`, or in a `.operstack-licence` file beside the
work. This package is MIT and its source is public, so the key states the terms of commercial use
and records who bought them; it is not a technical lock. Plan: https://oper-stack.com/products/agency/

## Who to write to first

`prospect` answers the question a batch of reports does not: of twenty sites, which one has the
worst problem and what do you say in the first line of the email.

```
operstack-audit prospect clients.txt --out prospects
```

Out comes `prospects.csv` and `prospects.md`: one row per site, weakest first, with the two or
three open findings and one sentence written for a business owner rather than for an engineer.
Every sentence is a translation of a check that measured something; where there is no translation,
the raw finding is printed instead of an invention.

It runs the same checks as the report but skips the writing and the layout, so twenty sites take
minutes. Free, no licence needed.
