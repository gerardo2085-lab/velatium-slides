const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const TEMPLATE_PATH = path.join(__dirname, 'template.html');
const DATA_PATH = path.join(__dirname, 'data', 'slides.json');
const OUTPUT_DIR = path.join(__dirname, 'output');
const BACKGROUNDS_DIR = path.join(__dirname, 'backgrounds');

const WIDTH = 1080;
const HEIGHT = 1350;

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
// headline/body — never render a broken deck.
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
    await page.screenshot({ path: path.join(OUTPUT_DIR, `slide_${index}.png`) });

    fs.unlinkSync(tempPath);
    console.log(`Rendered slide_${index}.png (${slide.role})`);
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
