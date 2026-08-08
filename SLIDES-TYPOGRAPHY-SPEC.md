# VELATIUM SLIDES — Typography & Safe-Zone Fix (for Claude Code)

Repo: `gerardo2085-lab/velatium-slides` (render.js + template.html). The 6-slide pipeline works and has shipped real decks — this is a legibility/reach fix only. No routine changes here (the routine's word caps are handled separately).

**Problem:** shipped slides render text too small and too wide for mobile feeds. Research-backed constraints below.

## Requirements

### 1. Type scale (canvas is 1080×1350)
- **Headline (Cinzel, gold #C8A951):** target ~76–92px. Auto-fit: start at 92px, step down (min 64px) until it fits within the text column at ≤3 lines. Never wrap to 4+.
- **Body (Lato, off-white):** minimum **44px** (research floor is 24px on mobile — we're well above because history text is dense). Auto-fit start 52px → min 44px. If body still overflows at 44px, do NOT shrink further — let it clip and log a warning naming the slide, so the copy gets shortened instead of made unreadable.
- **Eyebrow / slide counter / footer:** keep current relative sizing (they're fine), just ensure ≥28px.

### 2. Safe zones (this is a real cropping/occlusion issue)
- **Critical text must live inside the centered 1080×1080 square** (y from 135 to 1215). Instagram crops 4:5 to square on profile grids — anything outside is lost there.
- **Nothing critical below y=1150** — Instagram's caption preview overlays the bottom ~200px. The "THE VELATIUM" wordmark and source credit may stay in that band (branding, non-critical), but headline/body must not.
- Left/right margins: keep text column ≤ 900px wide, centered — currently text runs edge-to-edge on some slides.

### 3. Contrast / legibility
- Strengthen the scrim behind text: ensure a measurable minimum contrast between body text and the background beneath it. A slightly stronger bottom-weighted gradient (or a localized dark panel behind the text column at low opacity) — whatever keeps the imagery visible while guaranteeing readability on the lighter backgrounds (latin-america and forbidden-history are the risky ones).

### 4. Verification (do this, don't eyeball)
- Render a test deck on EACH of the 4 pillar backgrounds using deliberately long sample copy (headline 8 words, body 25 words).
- Confirm: no text outside the 1080×1080 center square; nothing critical below y=1150; body never below 44px; headline never 4+ lines.
- Produce the 6 PNGs and view them at phone scale (downscale to ~390px wide) — text must be comfortably readable at that size. Attach/report the check.

## Acceptance
- [ ] Type scale implemented with auto-fit + floors as specified
- [ ] Safe-zone constraints enforced; verified against all 4 backgrounds
- [ ] Scrim/contrast improved; legible on the lightest background
- [ ] Warning logged (not silent shrink) when copy exceeds the box at minimum size
- [ ] Test decks rendered and checked at 390px scale
