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
- The homepage and a sample of pages from the sitemap: title and description lengths, shortcodes or encoded data in the description, H1 count, alt coverage, canonical, robots meta, viewport (zoom blocked), Open Graph and Twitter cards, JSON-LD types (FAQPage, Organization and business types), script and stylesheet counts, hreflang, exposed dates, word counts, duplicate titles, thin pages, utility pages in the index, and on WordPress the xmlrpc endpoint.

Every finding becomes a row with a status (`ok`, `warn`, `bad`, `na`), a value and a comment. `bad` rows are copied into the critical-issues page automatically.

**Scores are computed, never typed.** The six area scores on page 2 are rendered from the checks each time the report is built: a check that passes counts one, a check that needs attention a half, a failing check nothing, and `na` is ignored. A number written by hand into `audit.json` is ignored and named by `operstack-audit check`. The two areas this audit does not measure, Off-page and trust and Conversion and UX, are printed as **not measured** rather than scored: nothing here rests on an impression. Each card also shows the count it came from, so a reader can recompute it from the checklist.

## What the analyst writes

`check` lists every narrative field still holding a `{{placeholder}}`: the client name and subject, the executive summary and verdict, three priorities, the overview note, content strengths and gaps, the AEO and GEO commentary, off-page, conversion rows, the roadmap and the closing message. The rendered report highlights any placeholder in yellow so a draft cannot ship by accident.

An agent can fill these fields from the JSON: the Claude Code plugin `operstack-seo` reads `audit.json`, writes the narrative and calls `render`.

## What `render` produces

Ten A4 pages: cover, executive summary with a scorecard, site overview with the sampled pages, critical issues, technical and on-page checklist, content and structure, AEO and GEO, off-page and conversion and limitations, roadmap in three phases, closing message. HTML always; PDF with `--pdf` when Chrome or Chromium is installed (`CHROME_PATH` overrides the lookup).

## Example

`examples/sample-audit.json` is a complete, fictional audit of "Example Villas". `npm run sample` renders it to HTML and PDF next to the JSON.

## Limits

The external tier reads public pages only. It does not run a lab performance test, does not query keyword or backlink tools, and does not see impressions or conversions. The report says so on its limitations page.

## License

MIT. Built by OperStack.
