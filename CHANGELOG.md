# Changelog

## 0.1.0 (2026-09-10)

First public release.

- `collect <url>`: public signals of a site into audit.json: HTTPS, www canonicalisation, time to first byte, robots.txt per user agent, sitemaps, llms.txt, homepage and sampled pages (titles, descriptions, H1, alt coverage, canonical, viewport, Open Graph, JSON-LD types, dates, word counts, duplicate titles, thin pages, utility pages), suggested scores.
- `check <audit.json>`: lists narrative fields still holding placeholders.
- `render <audit.json> [--pdf]`: ten-page print-ready report, PDF through headless Chrome.
- Fictional sample audit in `examples/`.
