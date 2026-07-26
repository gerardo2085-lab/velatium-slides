# velatium-slides

Daily pillar-topic slideshow renderer for The Velatium. A Claude Code Cloud
Routine researches a topic, scores it, and writes `data/slides.json`; this
repo's `render.js` turns that into 6 finished 1080×1350 PNGs ready for
TikTok/Instagram. Modeled directly on `wealthsimplified-slides` — same
Playwright-in-the-routine's-own-session render approach, same
force-push-to-a-branch delivery, same fixed-Chromium-path detection.

## Render

```bash
npm install
node render.js
```

Reads `template.html` + `data/slides.json`, writes `output/slide_01.png`
through `output/slide_06.png`.

## The `slides.json` contract

```json
{
  "date": "2026-07-26",
  "pillar": "lost-civilizations",
  "topic_title": "…",
  "slides": [
    { "role": "HOOK",     "headline": "…", "body": "…" },
    { "role": "CONTEXT",  "headline": "…", "body": "…" },
    { "role": "RUPTURE",  "headline": "…", "body": "…" },
    { "role": "EVIDENCE", "headline": "…", "body": "…" },
    { "role": "PATTERN",  "headline": "…", "body": "…" },
    { "role": "CTA",      "headline": "…", "body": "…" }
  ]
}
```

- `pillar` must be one of `latinoamerica`, `forbidden-history`, `lost-civilizations`, `god-power`. It selects the single shared background for all 6 slides: `backgrounds/{pillar}.jpeg`.
- `slides` must be exactly 6 items, roles in this exact fixed order (`render.js` enforces the order, not just the count).
- Every slide's `headline` and `body` must be non-empty strings. `render.js` validates the whole deck before rendering anything and `process.exit(1)`s with a specific message on any violation — it never writes a partial/broken deck.
- `source` is optional per slide (shown small, bottom-left footer) — omit or leave blank if not applicable.
- A missing `backgrounds/{pillar}.jpeg` file never crashes the render — it logs a warning and falls back to the template's solid dark background.

## Directory layout

- `render.js` — the renderer (see above)
- `template.html` — locked slide markup/CSS (Cinzel gold headline, Lato body, dark scrim + grain + vignette — matches thevelatium.com's own design tokens)
- `backgrounds/` — the 4 pillar background images, `{pillar}.jpeg`
- `data/slides.json` — written fresh by the routine each run
- `output/` — the 6 rendered PNGs (force-pushed to the daily render branch, not committed to `main`)

## Delivery

Same convention as `wealthsimplified-slides`: the routine resets a
`claude/daily-slides` branch from `main`, commits `data/slides.json` +
`output/slide_0N.png`, and force-pushes. Any other `claude/*` branch is an
orphan from an unclean push and is safe to delete.
