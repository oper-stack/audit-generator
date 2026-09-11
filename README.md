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

## Example

`examples/sample-audit.json` is a complete, fictional audit of "Example Villas". `npm run sample` renders it to HTML and PDF next to the JSON.

## Limits

The external tier reads public pages only. It does not run a lab performance test and does not see impressions or conversions. Conversion is scored on the contact path the pages offer, which is measurable from the HTML, not on visitor behaviour, which is not. Reviews and press are not read at all, and the report says so rather than guessing.

## License

MIT. Built by OperStack.
