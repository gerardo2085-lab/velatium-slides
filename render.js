const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const TEMPLATE_PATH = path.join(__dirname, 'template.html');
// Optional CLI overrides for SLIDES-TYPOGRAPHY-SPEC.md §4 verification
// decks, so testing never touches the real data/slides.json or output/:
//   node render.js [path/to/slides.json] [output/dir]
const DATA_PATH = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, 'data', 'slides.json');
const OUTPUT_DIR = process.argv[3] ? path.resolve(process.argv[3]) : path.join(__dirname, 'output');
const BACKGROUNDS_DIR = path.join(__dirname, 'backgrounds');

const WIDTH = 1080;
const HEIGHT = 1350;

// Must match template.html's .safe-zone { top, height } -- the tighter
// "nothing critical below y=1150" constraint from SLIDES-TYPOGRAPHY-SPEC.md
// §2 (Instagram's caption-preview band), not the looser 1080x1080-square
// bound the spec also mentions.
const SAFE_ZONE_TOP = 135;
const SAFE_ZONE_BOTTOM = 1150;
const SAFE_ZONE_EPSILON = 1; // sub-pixel rounding tolerance

const REQUIRED_ROLES = ['HOOK', 'CONTEXT', 'RUPTURE', 'EVIDENCE', 'PATTERN', 'CTA'];

// Verbatim from wealthsimplified-slides/render.js — proven, not reinvented.
function findChromiumPath() {
  const directCandidates = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ];
  for (const p of directCandidates) {
    if (fs.existsSync(p)) return p;
  }

  const cacheRoots = [
    '/opt/pw-browsers',
    path.join(process.env.HOME || '/root', '.cache', 'ms-playwright'),
  ];

  for (const root of cacheRoots) {
    if (!fs.existsSync(root)) continue;
    const dirs = fs.readdirSync(root).filter((d) => d.startsWith('chromium'));
    for (const d of dirs) {
      const exe = path.join(root, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(exe)) return exe;
    }
  }

  return null;
}

// Validation gate (spec's equivalent of WS's hero-stat/accent match gate):
// exactly 6 slides, in the fixed role order, each with non-empty
// headline/body — never render a broken deck. This is about malformed
// *input data* and stays fatal; it's a different class of problem from
// the geometry warnings assertFit() below reports (those are about copy
// length vs. the rendered box, and must never block a render — see
// SLIDES-TYPOGRAPHY-SPEC.md §1: "log a warning... so the copy gets
// shortened instead of made unreadable", not "refuse to render").
function validateDeck(deck) {
  if (!deck || typeof deck !== 'object') {
    console.error('slides.json: root must be an object with date/pillar/topic_title/slides.');
    process.exit(1);
  }
  if (!Array.isArray(deck.slides) || deck.slides.length !== 6) {
    console.error(`slides.json: "slides" must be an array of exactly 6 items (got ${Array.isArray(deck.slides) ? deck.slides.length : typeof deck.slides}).`);
    process.exit(1);
  }
  deck.slides.forEach((slide, i) => {
    const label = `Slide ${i + 1}`;
    if (typeof slide.role !== 'string' || !slide.role.trim()) {
      console.error(`${label}: missing "role".`);
      process.exit(1);
    }
    if (slide.role !== REQUIRED_ROLES[i]) {
      console.error(`${label}: expected role "${REQUIRED_ROLES[i]}" at this position, got "${slide.role}".`);
      process.exit(1);
    }
    if (typeof slide.headline !== 'string' || !slide.headline.trim()) {
      console.error(`${label} (${slide.role}): "headline" is empty.`);
      process.exit(1);
    }
    if (typeof slide.body !== 'string' || !slide.body.trim()) {
      console.error(`${label} (${slide.role}): "body" is empty.`);
      process.exit(1);
    }
  });
}

function buildBody(slide) {
  return `
    <div class="headline">${slide.headline}</div>
    <div class="divider"></div>
    <div class="body-text">${slide.body}</div>`;
}

// Background is one image per deck (keyed by pillar), cover-fit into the
// full 1080x1350 frame. Per spec: a missing file must never crash the
// render — log it and fall back to the template's solid #0A0A0A instead.
function buildBackgroundStyle(pillar) {
  const filename = `${pillar}.jpeg`;
  const fullPath = path.join(BACKGROUNDS_DIR, filename);
  if (!fs.existsSync(fullPath)) {
    console.warn(`WARNING: background "${filename}" not found for pillar "${pillar}" — falling back to solid dark background.`);
    return '';
  }
  return `background-image: url('backgrounds/${filename}'); background-size: cover; background-position: center 30%;`;
}

/**
 * Runs template.html's client-side __fitSlide() (real DOM/font
 * measurement — see that file for why this can't be done by counting
 * characters in Node) and turns its return value into pass/fail
 * assertions per SLIDES-TYPOGRAPHY-SPEC.md §4: "do this, don't eyeball."
 *
 * Returns a report object for the slide; never throws/exits on a content
 * overflow (that's an expected, handled case — see validateDeck's doc
 * comment above for the fatal/non-fatal split) but DOES exit(1) on a
 * font-load failure, since every other measurement in the fit function is
 * computed against font metrics and is meaningless if the wrong font
 * rendered.
 */
async function checkFit(page, label) {
  const fit = await page.evaluate(() => window.__fitSlide());

  if (!fit.fontsOk.cinzel || !fit.fontsOk.lato) {
    const missing = [
      !fit.fontsOk.cinzel && 'Cinzel',
      !fit.fontsOk.lato && 'Lato',
    ].filter(Boolean).join(', ');
    console.error(`FATAL: ${label}: font(s) failed to load (${missing}). Every auto-fit measurement below would be computed against fallback-font metrics, not the real ones — refusing to render on a broken font load rather than silently ship wrong sizing.`);
    process.exit(1);
  }

  const violations = [];
  if (fit.headline.top < SAFE_ZONE_TOP - SAFE_ZONE_EPSILON) {
    violations.push(`headline top (${fit.headline.top.toFixed(1)}px) is above the safe zone (${SAFE_ZONE_TOP}px)`);
  }
  if (fit.body.bottom > SAFE_ZONE_BOTTOM + SAFE_ZONE_EPSILON) {
    violations.push(`body bottom (${fit.body.bottom.toFixed(1)}px) is below the safe zone (${SAFE_ZONE_BOTTOM}px)`);
  }
  if (fit.body.fontSize < 44) {
    violations.push(`body font-size (${fit.body.fontSize}px) is below the 44px floor`);
  }
  if (violations.length > 0) {
    console.error(`SAFE-ZONE VIOLATION on ${label}: ${violations.join('; ')}. This means the CSS geometry and the fit script's math have drifted apart — a bug, not a copy-length issue.`);
  }

  if (fit.headline.overflow) {
    console.warn(`⚠ ${label}: headline still wraps to ${fit.headline.lines} lines at the 64px floor. Per spec this should never happen — likely means the headline word budget (spec assumes ~8 words) needs to come down, not that the code is wrong.`);
  }

  if (fit.body.clipped) {
    const clippedPx = fit.body.scrollHeight - fit.body.clientHeight;
    console.warn(`⚠ ${label}: body text exceeds the safe zone at the 44px floor and was clipped (${clippedPx.toFixed(0)}px of text hidden). Shorten this slide's copy — per spec, this must not be "fixed" by shrinking the font further.`);
  }

  return { label, fit, violations };
}

async function main() {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
  const deck = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));

  validateDeck(deck);

  const total = deck.slides.length;
  const backgroundStyle = buildBackgroundStyle(deck.pillar);

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const chromiumPath = findChromiumPath();
  const browser = await chromium.launch(chromiumPath ? { executablePath: chromiumPath } : {});
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });

  const reports = [];

  for (let i = 0; i < deck.slides.length; i++) {
    const slide = deck.slides[i];
    const index = String(i + 1).padStart(2, '0');
    const bodyHtml = buildBody(slide);

    const html = template
      .replaceAll('{{INDEX}}', index)
      .replaceAll('{{TOTAL}}', String(total).padStart(2, '0'))
      .replaceAll('{{ROLE}}', slide.role)
      .replaceAll('{{BACKGROUND_STYLE}}', backgroundStyle)
      .replaceAll('{{SOURCE}}', slide.source || '')
      .replace('{{BODY}}', bodyHtml);

    const tempPath = path.join(__dirname, `_temp_slide_${index}.html`);
    fs.writeFileSync(tempPath, html);

    await page.goto(`file://${tempPath}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);

    const report = await checkFit(page, `slide_${index} (${slide.role})`);
    reports.push(report);

    await page.screenshot({ path: path.join(OUTPUT_DIR, `slide_${index}.png`) });

    fs.unlinkSync(tempPath);
    console.log(`Rendered slide_${index}.png (${slide.role}) — headline ${report.fit.headline.fontSize}px/${report.fit.headline.lines}L, body ${report.fit.body.fontSize}px${report.fit.body.clipped ? ' (clipped)' : ''}`);
  }

  await browser.close();

  const withViolations = reports.filter((r) => r.violations.length > 0);
  const withOverflow = reports.filter((r) => r.fit.body.clipped || r.fit.headline.overflow);
  if (withViolations.length > 0 || withOverflow.length > 0) {
    console.log(`\nFit summary: ${withViolations.length} safe-zone violation(s), ${withOverflow.length} slide(s) with copy-overflow warnings. See above for detail.`);
  } else {
    console.log('\nFit summary: all slides within the safe zone, no overflow, no violations.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
