# Visual & Content Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul all three carousel types with a unified visual system, validate photos, deduplicate news stories, and produce test renders for every post type.

**Architecture:** Six self-contained tasks executed in order. Tasks 1–2 pair (inner slides + GPT fields). Tasks 3–4 pair (resource carousel rebuild + CTA cleanup). Task 5 (photo validation) is shared logic added to news-carousel.js and imported by viral-demo-generator.js. Task 6 (deduplication) is isolated to orchestrator.js + a JSON file. Test renders run last against all three types with hardcoded mock data — no live API calls.

**Tech Stack:** Node.js, node-canvas, SerpApi, Pexels API, OpenAI GPT-4o-mini, Instagram Graph API

**Do not touch:** `orchestrator.js` scheduler/PM2 config, `image-renderer.js`, any `post-now.js` wiring.

---

## File Map

| File | Action | Responsible for |
|------|--------|-----------------|
| `modules/news-carousel.js` | Modify | Tasks 1, 4, 5 — inner slide types, CTA fix, validatePhoto |
| `modules/content-generator.js` | Modify | Task 2 — add source_name/source_headline, tighten slide copy |
| `modules/resource-carousel.js` | **Create** | Task 3 — full resource carousel renderer |
| `modules/resource-generator.js` | Modify | Task 3 — swap import from image-renderer → resource-carousel |
| `modules/viral-demo-generator.js` | Modify | Task 5 — validatePhoto applied to SerpApi result |
| `orchestrator.js` | Modify | Task 6 — duplicate story check |
| `memory/posted-stories.json` | **Create** | Task 6 — dedup store |
| `test-renders/run-test-renders.js` | **Create** | Task 7 — offline test render script |

---

## Task 1 — News Carousel Inner Slides (Two-Type System)

**Files:**
- Modify: `modules/news-carousel.js` — `renderInnerSlide` and `renderNewsCarouselV2`

### Background

`renderInnerSlide(text, slideNum, totalSlides, folder)` currently renders every inner slide identically. We replace it with a two-type dispatch:

- **Type A** (`'source'`) — slide 2 only: Source Receipt Card
- **Type B** (`'text'`) — slides 3 to second-to-last: Dark text fragment

`renderNewsCarouselV2` passes `gptData` already. We extend it to pass source data for slide 2.

---

- [ ] **Step 1.1 — Replace `renderInnerSlide` signature and body**

In `modules/news-carousel.js`, replace the entire `renderInnerSlide` function (lines 280–327) with:

```js
// ── Inner slides ──────────────────────────────────────────────────────────────
// data: { type: 'source', source_name, source_headline } | { type: 'text', text }

async function renderInnerSlide(data, slideNum, totalSlides, folder) {
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  if (data.type === 'source') {
    // ── Type A: Source Receipt Card ──────────────────────────────────────────
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 0, W, H);

    // Inset card
    const cardX = 60, cardY = Math.round(H * 0.28), cardW = W - 120, cardH = Math.round(H * 0.44);
    ctx.fillStyle = '#1a1a1a';
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(cardX, cardY, cardW, cardH);
    ctx.fill();
    ctx.stroke();

    const innerX  = cardX + 40;
    const innerW  = cardW - 80;
    let   cursorY = cardY + 48;

    // Outlet name — gold, Arial Black, 28px, all caps
    ctx.font         = `bold 28px ${FONT_DISPLAY}`;
    ctx.fillStyle    = GOLD;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(String(data.source_name || 'SOURCE').toUpperCase(), innerX, cursorY);
    cursorY += 36;

    // Thin gold divider
    ctx.strokeStyle = GOLD;
    ctx.lineWidth   = 1;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(innerX, cursorY);
    ctx.lineTo(innerX + innerW, cursorY);
    ctx.stroke();
    ctx.globalAlpha = 1;
    cursorY += 20;

    // Headline — white, Arial, 32px, max 2 lines
    ctx.font         = `32px ${FONT_BODY}`;
    ctx.fillStyle    = WHITE;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';
    const hLines = wrapLines(ctx, String(data.source_headline || ''), innerW).slice(0, 2);
    for (const ln of hLines) {
      ctx.fillText(ln, innerX, cursorY);
      cursorY += 42;
    }
    cursorY += 16;

    // Footer — grey "via [source] — AI News", 18px
    ctx.font         = `18px ${FONT_BODY}`;
    ctx.fillStyle    = 'rgba(255,255,255,0.40)';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`via ${String(data.source_name || 'Source')} — AI News`, innerX, cursorY);

  } else {
    // ── Type B: Dark Text Slide ──────────────────────────────────────────────
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, W, H);

    // Gold top strip
    ctx.fillStyle = GOLD;
    ctx.fillRect(0, 0, W, 4);

    // Text — centered, Arial Black, max 12 words enforced by truncation
    const textMaxW = W - 2 * (PAD + 20);
    const rawWords = String(data.text || '').split(/\s+/).slice(0, 12);
    const textStr  = rawWords.join(' ');

    let fontSize = 64;
    ctx.font     = `bold ${fontSize}px ${FONT_DISPLAY}`;
    let lines    = wrapLines(ctx, textStr, textMaxW);
    while (lines.length > 4 && fontSize > 36) {
      fontSize -= 4;
      ctx.font = `bold ${fontSize}px ${FONT_DISPLAY}`;
      lines    = wrapLines(ctx, textStr, textMaxW);
    }

    const lh     = Math.round(fontSize * 1.15);
    const totalH = lines.length * lh;
    let   ty     = (H - totalH) / 2;

    ctx.font         = `bold ${fontSize}px ${FONT_DISPLAY}`;
    ctx.fillStyle    = WHITE;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    for (const ln of lines) {
      ctx.fillText(ln, W / 2, ty);
      ty += lh;
    }
  }

  // Slide number — faded, bottom-right, "N / M" format
  ctx.font         = `14px "Courier New", monospace`;
  ctx.fillStyle    = 'rgba(255,255,255,0.20)';
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${slideNum} / ${totalSlides}`, W - PAD, H - PAD);

  const filename = `slide_${String(slideNum).padStart(2, '0')}.jpg`;
  return saveCanvas(canvas, path.join(folder, filename));
}
```

- [ ] **Step 1.2 — Update `renderNewsCarouselV2` to pass typed data**

In `modules/news-carousel.js`, replace the inner-slide rendering loop inside `renderNewsCarouselV2`:

```js
// BEFORE (around line 446-450):
  for (let i = 0; i < innerSlides.length; i++) {
    paths.push(await renderInnerSlide(innerSlides[i], i + 2, totalSlides, folder));
    console.log(`[news-carousel-v2] Inner slide ${i + 2} done`);
  }

// AFTER:
  for (let i = 0; i < innerSlides.length; i++) {
    const slideNum = i + 2;
    let slideData;
    if (i === 0) {
      // Slide 2 = Type A: Source Receipt Card
      slideData = {
        type:             'source',
        source_name:      d.source_name     || 'AI News',
        source_headline:  d.source_headline || innerSlides[0],
      };
    } else {
      // Slides 3+ = Type B: Dark text
      slideData = { type: 'text', text: innerSlides[i] };
    }
    paths.push(await renderInnerSlide(slideData, slideNum, totalSlides, folder));
    console.log(`[news-carousel-v2] Inner slide ${slideNum} done`);
  }
```

- [ ] **Step 1.3 — Smoke test (offline)**

```bash
node -e "
require('dotenv').config();
const { renderInnerSlide } = require('./modules/news-carousel');
const path = require('path');
const fs = require('fs');
const folder = './test-renders';
fs.mkdirSync(folder, { recursive: true });
Promise.all([
  renderInnerSlide({ type: 'source', source_name: 'TechCrunch', source_headline: 'OpenAI plans to raise \$40B at record valuation' }, 2, 7, folder),
  renderInnerSlide({ type: 'text', text: 'AGI is closer than anyone predicted' }, 3, 7, folder),
]).then(paths => { console.log('OK', paths); }).catch(e => console.error(e));
"
```

Expected: two files saved to `test-renders/` with no errors.

- [ ] **Step 1.4 — Commit**

```bash
git add modules/news-carousel.js
git commit -m "feat: two-type inner slides — source receipt card + dark text"
```

---

## Task 2 — GPT Prompt Update

**Files:**
- Modify: `modules/content-generator.js` — `news_carousel` and `viral_demo` prompt functions

---

- [ ] **Step 2.1 — Add `source_name` / `source_headline` to `news_carousel` prompt**

In `modules/content-generator.js`, find the `news_carousel` prompt template. Make these two changes:

**A.** Replace the `INNER SLIDES` instruction block:

```
// BEFORE:
INNER SLIDES (slides array, slides 2 through N-1):
- Each slide covers ONE idea only
- Large clean text on dark background
- No more than 40 words per slide
- Lead with the most alarming or surprising fact first
- Include specific numbers, names, dollar amounts wherever possible
- First inner slide should be the key fact that proves the headline
- Last inner slide should be a "why this matters" or forward-looking statement
- Provide 4 to 6 inner slides

// AFTER:
INNER SLIDES (slides array, slides 2 through N-1):
- Each slide covers ONE idea only — punchy declarative fragment, no full sentences, no subordinate clauses
- HARD LIMIT: 12 words maximum per slide. Count the words. Do not exceed 12.
- Lead with the most alarming or surprising fact first
- Include specific numbers, names, dollar amounts wherever possible
- First inner slide should be the key fact that proves the headline
- Last inner slide should be a "why this matters" or forward-looking statement
- Provide 4 to 6 inner slides
```

**B.** Add `source_name` and `source_headline` to the JSON schema and instructions, just before the "Return ONLY valid JSON" line:

```
SOURCE INFO:
- "source_name": the outlet name where this story originated (e.g. "TechCrunch", "Bloomberg", "r/ClaudeAI")
- "source_headline": the actual article or post title, max 15 words, verbatim or close paraphrase
```

And add these fields to the returned JSON object:

```json
{
  "headline": "ALL CAPS HEADLINE MAX 12 WORDS",
  "subtitle": "6-8 word subtitle describing hook angle",
  "photo_subject": "Full Name or Company",
  "source_name": "TechCrunch",
  "source_headline": "Original article title, max 15 words",
  "slides": [
    "First inner slide — key fact, max 12 words.",
    "Second inner slide — context or detail, max 12 words.",
    "Third inner slide — who is affected, max 12 words.",
    "Fourth inner slide — why this matters, max 12 words."
  ],
  "caption": "Full Instagram caption text with paragraphs separated by newlines. End with follow instruction and source.",
  "cta_keyword": "BREAKING"
}
```

- [ ] **Step 2.2 — Add `source_name` / `source_headline` to `viral_demo` prompt**

In the same file, find the `viral_demo` prompt template. Add to the IMAGE DIRECTION section:

```
- "source_name": the subreddit (e.g. "r/ChatGPT") or site where this story came from
- "source_headline": the original post or article title, max 15 words
```

And add to the returned JSON object:

```json
{
  "headline": "ALL CAPS HEADLINE MAX 10 WORDS",
  "subtitle": "6-8 word subtitle",
  "person_name": "Full Name or null",
  "source_name": "r/ChatGPT",
  "source_headline": "Original post title, max 15 words",
  "visual_description": "specific description of the cover image to fetch",
  "caption": "Full Instagram caption with paragraphs separated by newlines.",
  "post_type": "single_image"
}
```

- [ ] **Step 2.3 — Verify prompt parses cleanly**

```bash
node -e "
require('dotenv').config();
const { generateContent } = require('./modules/content-generator');
generateContent('news_carousel', 'AI tools', 'OpenAI announces GPT-5 release date')
  .then(d => {
    console.log('source_name:', d.source_name);
    console.log('source_headline:', d.source_headline);
    const bad = (d.slides || []).filter(s => s.split(' ').length > 12);
    if (bad.length) console.warn('SLIDES OVER 12 WORDS:', bad);
    else console.log('All slides within 12 words OK');
  }).catch(e => console.error(e.message));
"
```

Expected: `source_name` and `source_headline` are non-empty strings; no slides over 12 words.

- [ ] **Step 2.4 — Commit**

```bash
git add modules/content-generator.js
git commit -m "feat: add source_name/source_headline to GPT prompts, tighten slide word limit to 12"
```

---

## Task 3 — Resource Carousel Full Rebuild

**Files:**
- **Create:** `modules/resource-carousel.js`
- Modify: `modules/resource-generator.js` — swap import

The new module owns all rendering. `resource-generator.js` calls `renderResourceCarousel(content, folder)` from it instead of from `image-renderer.js`. `image-renderer.js` is untouched.

---

- [ ] **Step 3.1 — Create `modules/resource-carousel.js`**

```js
'use strict';
require('dotenv').config();
const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { fetchSlideImage } = require('./carousel-builder');

// ── Font registration ─────────────────────────────────────────────────────────
for (const f of [
  { path: 'C:/Windows/Fonts/ariblk.ttf', family: 'Arial Black' },
  { path: 'C:/Windows/Fonts/impact.ttf',  family: 'Impact' },
]) {
  try { if (fs.existsSync(f.path)) registerFont(f.path, { family: f.family }); }
  catch (_) {}
}

// ── Constants ─────────────────────────────────────────────────────────────────
const W            = 1080;
const H            = 1350;
const GOLD         = '#E8C547';
const WHITE        = '#ffffff';
const PAD          = 40;
const FONT_DISPLAY = '"Arial Black", Impact, Arial, sans-serif';
const FONT_BODY    = 'Arial, sans-serif';

function saveCanvas(canvas, outPath) {
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outPath, canvas.toBuffer('image/jpeg', { quality: 0.93 }));
  return outPath;
}

function wrapLines(ctx, text, maxWidth) {
  const words = String(text || '').split(' ');
  const lines = []; let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) { current = test; }
    else { if (current) lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines;
}

function drawImageCover(ctx, img, x, y, w, h) {
  if (!img) return;
  const srcAR = img.width / img.height, dstAR = w / h;
  let sx, sy, sw, sh;
  if (srcAR > dstAR) { sh = img.height; sw = sh * dstAR; sx = (img.width - sw) / 2; sy = 0; }
  else               { sw = img.width;  sh = sw / dstAR; sx = 0; sy = (img.height - sh) / 2; }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function roundRectFill(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath(); ctx.fill();
}

// ── Photo fetching: SerpApi → Pexels → null ───────────────────────────────────
async function fetchResourcePhoto(query) {
  const serpKey = process.env.SERPAPI_KEY;
  if (serpKey) {
    try {
      const url = `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(query)}&api_key=${serpKey}`;
      const res = await fetch(url);
      if (res.ok) {
        const data   = await res.json();
        const imgUrl = data.images_results?.[0]?.original;
        if (imgUrl) {
          const imgRes = await fetch(imgUrl);
          if (imgRes.ok) {
            const buf = Buffer.from(await imgRes.arrayBuffer());
            console.log(`[resource-carousel] SerpApi photo: ${query}`);
            return await loadImage(buf);
          }
        }
      }
    } catch (err) { console.warn('[resource-carousel] SerpApi failed:', err.message); }
  }

  // Pexels fallback
  const tmpPath = await fetchSlideImage(query);
  if (tmpPath) {
    try {
      const img = await loadImage(tmpPath);
      try { fs.unlinkSync(tmpPath); } catch (_) {}
      console.log(`[resource-carousel] Pexels photo: ${query}`);
      return img;
    } catch (_) {}
  }

  console.log(`[resource-carousel] No photo found for "${query}" — using gradient`);
  return null;
}

// ── Watermark helper (shared with cover) ──────────────────────────────────────
function drawWatermark(ctx) {
  const wmText  = 'CUTTING EDGE OF AI';
  const wmSize  = 22;
  ctx.font      = `bold ${wmSize}px ${FONT_DISPLAY}`;
  const wmW     = ctx.measureText(wmText).width;
  const wmY     = PAD;
  const wmX     = W / 2;
  const lineY   = wmY + wmSize / 2;
  const gap     = 10;

  ctx.strokeStyle = WHITE; ctx.lineWidth = 1; ctx.globalAlpha = 0.7;
  ctx.beginPath(); ctx.moveTo(wmX - wmW / 2 - gap - wmW * 0.6, lineY); ctx.lineTo(wmX - wmW / 2 - gap, lineY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(wmX + wmW / 2 + gap, lineY); ctx.lineTo(wmX + wmW / 2 + gap + wmW * 0.6, lineY); ctx.stroke();
  ctx.globalAlpha = 0.9;

  ctx.fillStyle = WHITE; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  const letters = wmText.split('');
  const charSpacing = 3;
  const totalWmW = wmW + charSpacing * (letters.length - 1);
  let lx = wmX - totalWmW / 2;
  for (const ch of letters) {
    ctx.fillText(ch, lx, wmY);
    lx += ctx.measureText(ch).width + charSpacing;
  }
  ctx.globalAlpha = 1;
}

// ── Cover slide ───────────────────────────────────────────────────────────────
async function renderResourceCoverSlide(postType, hookText, folder) {
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // Dark gradient base
  const base = ctx.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#0d0d0d'); base.addColorStop(1, '#1a1a1a');
  ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);

  // Photo (search on tool/concept name derived from hookText)
  const query = hookText.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const img   = await fetchResourcePhoto(query);
  if (img) drawImageCover(ctx, img, 0, 0, W, H);

  // Dark gradient overlay (match news carousel cover)
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0,    'rgba(0,0,0,0.05)');
  grad.addColorStop(0.50, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1,    'rgba(0,0,0,0.85)');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

  // Watermark
  drawWatermark(ctx);

  // Headline — bottom 40%, centered
  const zoneTop  = Math.round(H * 0.60);
  const zoneH    = H - zoneTop;
  const textMaxW = W - 2 * PAD;
  const headline = hookText.toUpperCase();

  let hSize = 72;
  ctx.font  = `bold ${hSize}px ${FONT_DISPLAY}`;
  let hLines = wrapLines(ctx, headline, textMaxW);
  while ((hLines.length > 3 || (hLines.length > 0 && ctx.measureText(hLines[0]).width > textMaxW)) && hSize > 48) {
    hSize -= 4;
    ctx.font  = `bold ${hSize}px ${FONT_DISPLAY}`;
    hLines = wrapLines(ctx, headline, textMaxW);
  }
  hLines = hLines.slice(0, 3);

  // Subtitle
  const subtitle = postType.replace(/-/g, ' ').toUpperCase();
  const subSize  = 26;
  ctx.font = `${subSize}px ${FONT_BODY}`;
  const subLines = wrapLines(ctx, subtitle, textMaxW).slice(0, 1);
  const subLH    = subSize * 1.35;

  const hLH       = Math.round(hSize * 0.95);
  const totalTextH = hLines.length * hLH + (subLines.length > 0 ? 16 + subLines.length * subLH : 0);
  const blockStartY = zoneTop + (zoneH - totalTextH) / 2;

  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  let ty = blockStartY;
  ctx.font = `bold ${hSize}px ${FONT_DISPLAY}`; ctx.fillStyle = WHITE;
  for (const ln of hLines) { ctx.fillText(ln, W / 2, ty); ty += hLH; }

  if (subLines.length > 0) {
    ty += 16;
    ctx.font = `${subSize}px ${FONT_BODY}`; ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (const ln of subLines) { ctx.fillText(ln, W / 2, ty); ty += subLH; }
  }

  // SWIPE badge
  const badgeW = 100, badgeH = 36;
  const badgeX = W - PAD - badgeW, badgeY = H - PAD - badgeH;
  ctx.fillStyle = GOLD;
  roundRectFill(ctx, badgeX, badgeY, badgeW, badgeH, 8);
  ctx.font = `bold 20px ${FONT_DISPLAY}`; ctx.fillStyle = '#000';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('SWIPE', badgeX + badgeW / 2, badgeY + badgeH / 2);

  return saveCanvas(canvas, path.join(folder, 'slide_01.jpg'));
}

// ── Inner slide (Type B — same spec as news carousel) ─────────────────────────
// label: 'HOW TO GUIDE' | 'TOOL SPOTLIGHT' (gold, Arial Black, 16px, top center, letter-spaced)
async function renderResourceInnerSlide(text, label, slideNum, totalSlides, folder) {
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  ctx.fillStyle = '#0d0d0d'; ctx.fillRect(0, 0, W, H);

  // Gold top strip
  ctx.fillStyle = GOLD; ctx.fillRect(0, 0, W, 4);

  // Label — gold, Arial Black, 16px, letter-spaced, top center
  const labelText = (label || 'HOW TO GUIDE').toUpperCase();
  ctx.font = `bold 16px ${FONT_DISPLAY}`; ctx.fillStyle = GOLD;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  // Letter spacing via char-by-char
  const labelLetters = labelText.split('');
  const charSpacing  = 3;
  const labelW       = ctx.measureText(labelText).width + charSpacing * (labelLetters.length - 1);
  let lx = W / 2 - labelW / 2;
  const labelY = PAD + 10;
  for (const ch of labelLetters) {
    ctx.fillText(ch, lx, labelY);
    lx += ctx.measureText(ch).width + charSpacing;
  }

  // Body text — white Arial Black, centered, max 12 words
  const rawWords = String(text || '').split(/\s+/).slice(0, 12);
  const textStr  = rawWords.join(' ');
  const textMaxW = W - 2 * (PAD + 20);

  let fontSize = 64;
  ctx.font     = `bold ${fontSize}px ${FONT_DISPLAY}`;
  let lines    = wrapLines(ctx, textStr, textMaxW);
  while (lines.length > 4 && fontSize > 36) {
    fontSize -= 4;
    ctx.font = `bold ${fontSize}px ${FONT_DISPLAY}`;
    lines    = wrapLines(ctx, textStr, textMaxW);
  }

  const lh = Math.round(fontSize * 1.15);
  const totalH = lines.length * lh;
  let ty = (H - totalH) / 2;

  ctx.font = `bold ${fontSize}px ${FONT_DISPLAY}`; ctx.fillStyle = WHITE;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const ln of lines) { ctx.fillText(ln, W / 2, ty); ty += lh; }

  // Slide counter
  ctx.font = `14px "Courier New", monospace`; ctx.fillStyle = 'rgba(255,255,255,0.20)';
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillText(`${slideNum} / ${totalSlides}`, W - PAD, H - PAD);

  return saveCanvas(canvas, path.join(folder, `slide_${String(slideNum).padStart(2, '0')}.jpg`));
}

// ── CTA slide (matches news carousel CTA exactly) ─────────────────────────────
async function renderResourceCtaSlide(folder, slideNum, totalSlides) {
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  ctx.fillStyle = '#0d0d0d'; ctx.fillRect(0, 0, W, H);

  const textPad  = 60;
  const textMaxW = W - 2 * textPad;

  // Top question — pinned to top 35% zone
  const question = 'WANT THE BEST AI TOOLS EVERY WEEK?';
  let qSize = 52;
  ctx.font  = `bold ${qSize}px ${FONT_DISPLAY}`;
  while (ctx.measureText(question).width > textMaxW && qSize > 32) {
    qSize -= 4; ctx.font = `bold ${qSize}px ${FONT_DISPLAY}`;
  }
  const qLines  = wrapLines(ctx, question, textMaxW);
  const qLH     = qSize * 1.15;
  const qBlockH = qLines.length * qLH;
  let ty = Math.round((H * 0.35 - qBlockH) / 2);
  ctx.fillStyle = WHITE; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const ln of qLines) { ctx.fillText(ln, W / 2, ty); ty += qLH; }

  // CTA block — pinned around 54%
  const ctaLine1 = 'Comment "WORKFLOW" below';
  let ctaSize = 40;
  ctx.font = `bold ${ctaSize}px ${FONT_DISPLAY}`;
  while (ctx.measureText(ctaLine1).width > textMaxW && ctaSize > 24) {
    ctaSize -= 4; ctx.font = `bold ${ctaSize}px ${FONT_DISPLAY}`;
  }
  let cy = Math.round(H * 0.54);
  ctx.fillStyle = GOLD; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(ctaLine1, W / 2, cy);
  cy += ctaSize * 1.2 + 12;

  ctx.font = `28px ${FONT_BODY}`; ctx.fillStyle = WHITE;
  const ctaLines2 = wrapLines(ctx, "and we'll send you our top AI tools & updates", textMaxW);
  for (const ln of ctaLines2) { ctx.fillText(ln, W / 2, cy); cy += 38; }

  // Account info — bottom 15%
  const bottomY = Math.round(H * 0.82);
  ctx.font = `bold 26px ${FONT_DISPLAY}`; ctx.fillStyle = WHITE;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('@CuttingEdgeOfAI', W / 2, bottomY);

  ctx.font = `22px ${FONT_BODY}`; ctx.fillStyle = GOLD;
  ctx.fillText('stan.store/cuttingedgeofai', W / 2, bottomY + 40);

  // Slide counter
  ctx.font = `14px "Courier New", monospace`; ctx.fillStyle = 'rgba(255,255,255,0.20)';
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillText(`${slideNum} / ${totalSlides}`, W - PAD, H - PAD);

  return saveCanvas(canvas, path.join(folder, `slide_${String(slideNum).padStart(2, '0')}.jpg`));
}

// ── Main export ───────────────────────────────────────────────────────────────
// content: { post_type, hook_text, slides, caption_cta }
async function renderResourceCarousel(content, folder) {
  const { post_type, hook_text, slides } = content;
  const label = post_type === 'tool-spotlight' ? 'TOOL SPOTLIGHT' : 'HOW TO GUIDE';
  const paths = [];
  const totalSlides = 1 + Math.min(slides.length, 5) + 1; // cover + up to 5 inner + CTA

  console.log(`[resource-carousel] Rendering ${totalSlides} slides (${post_type})...`);

  paths.push(await renderResourceCoverSlide(post_type, hook_text, folder));
  console.log('[resource-carousel] Cover done');

  const innerCount = Math.min(slides.length, 5);
  for (let i = 0; i < innerCount; i++) {
    const slideData = slides[i];
    const text = typeof slideData === 'string'
      ? slideData
      : (slideData.one_liner || slideData.stat || JSON.stringify(slideData));
    paths.push(await renderResourceInnerSlide(text, label, i + 2, totalSlides, folder));
    console.log(`[resource-carousel] Inner slide ${i + 2} done`);
  }

  paths.push(await renderResourceCtaSlide(folder, totalSlides, totalSlides));
  console.log('[resource-carousel] CTA done');

  return paths;
}

module.exports = {
  renderResourceCarousel,
  renderResourceCoverSlide,
  renderResourceInnerSlide,
  renderResourceCtaSlide,
};
```

- [ ] **Step 3.2 — Update `modules/resource-generator.js` import**

In `modules/resource-generator.js`, replace line 6:

```js
// BEFORE:
const { renderResourceCarousel, getOutputFolder } = require('./image-renderer');

// AFTER:
const { renderResourceCarousel } = require('./resource-carousel');
const { getOutputFolder }        = require('./image-renderer');
```

- [ ] **Step 3.3 — Smoke test resource carousel offline**

```bash
node -e "
require('dotenv').config();
const { renderResourceCarousel } = require('./modules/resource-carousel');
const { getOutputFolder } = require('./modules/image-renderer');
const folder = './test-renders';
require('fs').mkdirSync(folder, { recursive: true });
const mock = {
  post_type: 'how-to-guide',
  hook_text: 'DO THIS WITH AI EVERY MORNING',
  slides: [
    'Open Claude and dump your entire task list',
    'Ask it to sort by impact and time required',
    'Build your schedule around the top three tasks',
    'Use AI to draft your hardest email first',
    'Review outputs before touching anything else',
  ],
};
renderResourceCarousel(mock, folder)
  .then(paths => console.log('OK', paths))
  .catch(e => console.error(e));
"
```

Expected: 7 `.jpg` files in `test-renders/`.

- [ ] **Step 3.4 — Commit**

```bash
git add modules/resource-carousel.js modules/resource-generator.js
git commit -m "feat: resource carousel full rebuild in dedicated module"
```

---

## Task 4 — CTA Slide Global Fix (Remove Follower Count)

**Files:**
- Modify: `modules/news-carousel.js` — `renderCtaSlide`

The string `'Join 100,000+ followers staying ahead of the curve.'` and its rendering block (lines 362–374) must be deleted entirely. Nothing replaces it.

---

- [ ] **Step 4.1 — Delete the subtext block from `renderCtaSlide`**

In `modules/news-carousel.js`, inside `renderCtaSlide`, remove this entire block (the section labelled `// ── Subtext — pinned around 38% ──`):

```js
// DELETE this entire block:
  // ── Subtext — pinned around 38% ──────────────────────────────────────────
  const subText  = 'Join 100,000+ followers staying ahead of the curve.';
  const subY     = Math.round(H * 0.38);
  ctx.font       = `32px ${FONT_BODY}`;
  ctx.fillStyle  = 'rgba(255,255,255,0.70)';
  ctx.textAlign  = 'center';
  ctx.textBaseline = 'top';
  const subLines = wrapLines(ctx, subText, textMaxW);
  let sy = subY;
  for (const ln of subLines) {
    ctx.fillText(ln, W / 2, sy);
    sy += 44;
  }
```

After deletion, verify no other occurrence of `100,000` exists anywhere in the codebase:

```bash
grep -r "100,000" modules/ --include="*.js"
```

Expected: no output.

- [ ] **Step 4.2 — Commit**

```bash
git add modules/news-carousel.js
git commit -m "fix: remove follower count claim from CTA slide globally"
```

---

## Task 5 — Photo Validation

**Files:**
- Modify: `modules/news-carousel.js` — add `validatePhoto`, apply in `fetchPressPhoto`
- Modify: `modules/viral-demo-generator.js` — import and apply `validatePhoto`

### Rejection criteria

| Criterion | Check |
|-----------|-------|
| Wide landscape (banner/logo) | `width / height > 1.5` — fetch HEAD, parse `Content-Type`, then load and check dimensions |
| Suspicious URL | URL contains `logo`, `icon`, `badge`, or `avatar` |
| Too small | `Content-Length` header < 51200 (50 KB) |

On rejection: log reason → try Pexels → if Pexels fails, return `null` (gradient fallback).

---

- [ ] **Step 5.1 — Add `validatePhoto` to `modules/news-carousel.js`**

Insert after the constants block, before `fetchPressPhoto`:

```js
// ── Photo validation ──────────────────────────────────────────────────────────
// Returns { valid: true } or { valid: false, reason: string }
async function validatePhoto(imageUrl) {
  // 1. URL keyword check
  const urlLower = imageUrl.toLowerCase();
  for (const bad of ['logo', 'icon', 'badge', 'avatar']) {
    if (urlLower.includes(bad)) return { valid: false, reason: `URL contains "${bad}"` };
  }

  // 2. HEAD request for size + content-type
  try {
    const headRes = await fetch(imageUrl, { method: 'HEAD' });
    if (!headRes.ok) return { valid: false, reason: `HEAD ${headRes.status}` };

    const contentLength = parseInt(headRes.headers.get('content-length') || '0', 10);
    if (contentLength > 0 && contentLength < 51200) {
      return { valid: false, reason: `File too small: ${contentLength} bytes` };
    }

    // 3. Ratio check via image load
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) return { valid: false, reason: `GET ${imgRes.status}` };
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const img = await loadImage(buf);
    if (img.width / img.height > 1.5) {
      return { valid: false, reason: `Landscape ratio ${(img.width / img.height).toFixed(2)}` };
    }

    // Return the buffer so we can reuse it — avoids a second fetch
    return { valid: true, buf };
  } catch (err) {
    return { valid: false, reason: err.message };
  }
}
```

- [ ] **Step 5.2 — Apply `validatePhoto` inside `fetchPressPhoto`**

Replace the SerpApi block in `fetchPressPhoto`:

```js
// BEFORE:
      const imgUrl = data.images_results?.[0]?.original;
      if (imgUrl) {
        const imgRes = await fetch(imgUrl);
        if (imgRes.ok) {
          const tmpPath = path.join(os.tmpdir(), `serpapi_${Date.now()}.jpg`);
          fs.writeFileSync(tmpPath, Buffer.from(await imgRes.arrayBuffer()));
          console.log(`[photo] SerpApi hit for: ${subject}`);
          return tmpPath;
        }
      }

// AFTER:
      const imgUrl = data.images_results?.[0]?.original;
      if (imgUrl) {
        const check = await validatePhoto(imgUrl);
        if (!check.valid) {
          console.warn(`[photo] SerpApi rejected (${check.reason}): ${imgUrl}`);
        } else {
          const tmpPath = path.join(os.tmpdir(), `serpapi_${Date.now()}.jpg`);
          fs.writeFileSync(tmpPath, check.buf);
          console.log(`[photo] SerpApi hit for: ${subject}`);
          return tmpPath;
        }
      }
```

- [ ] **Step 5.3 — Export `validatePhoto` and import in `viral-demo-generator.js`**

At the bottom of `modules/news-carousel.js`, add `validatePhoto` to `module.exports`:

```js
module.exports = { renderNewsCarouselV2, renderCoverSlide, renderInnerSlide, renderCtaSlide, fetchPressPhoto, validatePhoto };
```

In `modules/viral-demo-generator.js`, add import at top:

```js
const { renderCoverSlide, validatePhoto } = require('./news-carousel');
```

Then in `generateViralDemoPost`, after `fetchPressPhoto` returns the `photo_subject` result, the validation already runs inside `fetchPressPhoto`. No additional call is needed in the demo generator — the fallback chain is handled internally.

- [ ] **Step 5.4 — Verify validation fires**

```bash
node -e "
require('dotenv').config();
const { validatePhoto } = require('./modules/news-carousel');
// Test a known logo URL
validatePhoto('https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Culinary_fruits_front_view.jpg/1280px-Culinary_fruits_front_view.jpg')
  .then(r => console.log('Photo check result:', r))
  .catch(e => console.error(e));
"
```

Expected: `{ valid: true, buf: <Buffer ...> }` (or `valid: false` with a reason if it triggers a check).

- [ ] **Step 5.5 — Commit**

```bash
git add modules/news-carousel.js modules/viral-demo-generator.js
git commit -m "feat: validatePhoto — reject logos, banners, tiny images; fallback to Pexels"
```

---

## Task 6 — Duplicate Story Prevention

**Files:**
- Modify: `orchestrator.js` — add dedup logic around news-carousel story selection
- **Create:** `memory/posted-stories.json` — initialized as `[]`

---

- [ ] **Step 6.1 — Create `memory/posted-stories.json`**

```bash
node -e "
const fs = require('fs');
fs.mkdirSync('./memory', { recursive: true });
if (!fs.existsSync('./memory/posted-stories.json')) {
  fs.writeFileSync('./memory/posted-stories.json', '[]');
  console.log('created memory/posted-stories.json');
} else {
  console.log('already exists');
}
"
```

- [ ] **Step 6.2 — Add dedup helpers to `orchestrator.js`**

Insert after the `_newsCache` declaration (around line 117), before `getNewsStories`:

```js
// ── Duplicate story prevention ────────────────────────────────────────────────
const POSTED_STORIES_PATH = path.join(__dirname, 'memory', 'posted-stories.json');

function loadPostedStories() {
  try { return JSON.parse(fs.readFileSync(POSTED_STORIES_PATH, 'utf8')); }
  catch { return []; }
}

function savePostedStories(entries) {
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  const trimmed = entries.filter(e => e.timestamp > cutoff);
  fs.mkdirSync(path.dirname(POSTED_STORIES_PATH), { recursive: true });
  fs.writeFileSync(POSTED_STORIES_PATH, JSON.stringify(trimmed, null, 2));
}

function storyKey(headline) {
  return String(headline || '').trim().split(/\s+/).slice(0, 8).join(' ').toLowerCase();
}

function isDuplicateStory(headline) {
  const key    = storyKey(headline);
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const posted = loadPostedStories();
  return posted.some(e => e.timestamp > cutoff && storyKey(e.headline) === key);
}

function markStoryPosted(headline) {
  const posted = loadPostedStories();
  posted.push({ headline: String(headline), timestamp: Date.now() });
  savePostedStories(posted);
}
```

- [ ] **Step 6.3 — Apply dedup in the `news-carousel` branch of `runSlot`**

In `orchestrator.js`, inside the `} else if (format === 'news-carousel') {` block, replace the story selection logic:

```js
// BEFORE:
      const storyIndex = (slotIndex % FORMAT_SCHEDULE.length) === 1 ? 0 : 1;
      const story = stories[storyIndex];
      console.log('[' + page.name + '] News carousel: ' + story.title);

// AFTER:
      const preferredIndex = (slotIndex % FORMAT_SCHEDULE.length) === 1 ? 0 : 1;
      let story = null;
      for (let si = preferredIndex; si < stories.length; si++) {
        if (!isDuplicateStory(stories[si].title)) { story = stories[si]; break; }
        console.log(`[${page.name}] Skipping duplicate story: ${stories[si].title}`);
      }
      if (!story) {
        console.log(`[${page.name}] All stories are duplicates — slot skipped`);
        return;
      }
      console.log('[' + page.name + '] News carousel: ' + story.title);
```

- [ ] **Step 6.4 — Mark story posted after successful carousel post**

After the `await postCarousel(...)` call for the news carousel, add:

```js
      markStoryPosted(story.title);
      console.log(`[${page.name}] Story marked as posted: ${story.title}`);
```

- [ ] **Step 6.5 — Verify dedup logic offline**

```bash
node -e "
const fs = require('fs');
// Simulate a prior post
fs.mkdirSync('./memory', { recursive: true });
fs.writeFileSync('./memory/posted-stories.json', JSON.stringify([
  { headline: 'OpenAI announces GPT-5 release date next month', timestamp: Date.now() - 1000 }
]));

// Load orchestrator helpers in isolation
const path = require('path');
const POSTED_STORIES_PATH = './memory/posted-stories.json';
function loadPostedStories() { return JSON.parse(fs.readFileSync(POSTED_STORIES_PATH, 'utf8')); }
function storyKey(h) { return String(h).trim().split(/\s+/).slice(0, 8).join(' ').toLowerCase(); }
function isDuplicateStory(headline) {
  const key = storyKey(headline); const cutoff = Date.now() - 24*60*60*1000;
  return loadPostedStories().some(e => e.timestamp > cutoff && storyKey(e.headline) === key);
}

console.log('Exact match:', isDuplicateStory('OpenAI announces GPT-5 release date next month'));   // true
console.log('Different:',   isDuplicateStory('DeepSeek R2 beats GPT-4o on every benchmark'));      // false
console.log('Partial match:', isDuplicateStory('OpenAI announces GPT-5 release date confirmed'));   // true (first 8 words match)
"
```

Expected output:
```
Exact match: true
Different: false
Partial match: true
```

- [ ] **Step 6.6 — Commit**

```bash
git add orchestrator.js memory/posted-stories.json
git commit -m "feat: duplicate story prevention via memory/posted-stories.json"
```

---

## Task 7 — Test Renders (All Three Post Types, No Live API Calls)

**Files:**
- **Create:** `test-renders/run-test-renders.js`

Runs offline using hardcoded mock data. No GPT calls, no Instagram API, no Cloudinary. Photos may use SerpApi/Pexels if keys are present — acceptable. Saves all output to `test-renders/`.

---

- [ ] **Step 7.1 — Create `test-renders/run-test-renders.js`**

```js
'use strict';
/**
 * Offline test render script — no live API calls to GPT or Instagram.
 * Saves renders to test-renders/<type>/ folders.
 * Run: node test-renders/run-test-renders.js
 */
require('dotenv').config();
const path = require('path');
const fs   = require('fs');

const { renderNewsCarouselV2, renderCoverSlide, renderCtaSlide } = require('../modules/news-carousel');
const { renderResourceCarousel } = require('../modules/resource-carousel');
const { renderCoverSlide: ncCover } = require('../modules/news-carousel');

const BASE = path.join(__dirname);

async function testNewsCarousel() {
  const folder = path.join(BASE, 'news-carousel');
  fs.mkdirSync(folder, { recursive: true });

  const mockStory = { title: 'OpenAI announces GPT-5 release date', hook_angle: 'The model that changes everything' };
  const mockGpt = {
    headline:        'OPENAI JUST SET A DATE FOR GPT-5 LAUNCH',
    subtitle:        'Everything changes this summer',
    photo_subject:   'Sam Altman',
    source_name:     'TechCrunch',
    source_headline: 'OpenAI confirms GPT-5 arriving in Q3 2026',
    slides: [
      'GPT-5 launches Q3 2026 according to OpenAI',
      'Context window triples to 300,000 tokens',
      'Reasoning benchmarks beat o3 by 40 percent',
      'Enterprise pricing starts at double GPT-4o',
      'Every ChatGPT Plus user gets access day one',
    ],
    caption:     'OpenAI just confirmed the date.\n\nGPT-5 is coming Q3 2026.\n\nFollow us (@cuttingedgeofai) for everything latest from the AI world.\nSource: TechCrunch',
    cta_keyword: 'BREAKING',
  };

  console.log('\n[test] Rendering news carousel...');
  const paths = await renderNewsCarouselV2(mockStory, mockGpt, folder);
  console.log('[test] News carousel done:', paths);
  return paths;
}

async function testViralDemo() {
  const folder = path.join(BASE, 'viral-demo');
  fs.mkdirSync(folder, { recursive: true });

  const mockGpt = {
    headline:      "THIS GUY CAN'T CODE BUT RUNS AI EMPIRE",
    subtitle:      'Coworkers say he barely understands ML',
    photo_subject: 'Sam Altman',
    person_name:   'Sam Altman',
  };

  console.log('\n[test] Rendering viral demo cover...');
  const imgPath = await renderCoverSlide(mockGpt, folder, 1, 1, false);
  console.log('[test] Viral demo done:', imgPath);
  return [imgPath];
}

async function testResourceCarousel() {
  const folder = path.join(BASE, 'resource-carousel');
  fs.mkdirSync(folder, { recursive: true });

  const mock = {
    post_type:   'how-to-guide',
    hook_text:   'DO THIS WITH AI EVERY MORNING',
    slides: [
      'Dump your full task list into Claude first',
      'Sort by impact then by time required',
      'Build your schedule around top three tasks',
      'Draft your hardest email with AI assistance',
      'Review AI outputs before touching inbox',
    ],
    caption_cta: "Save this. Comment WORKFLOW and I'll send you 5 more 👇",
  };

  console.log('\n[test] Rendering resource carousel...');
  const paths = await renderResourceCarousel(mock, folder);
  console.log('[test] Resource carousel done:', paths);
  return paths;
}

(async () => {
  console.log('=== Shadow Pages Test Renders ===');
  const results = {};
  const errors  = [];

  try { results.news    = await testNewsCarousel();    } catch (e) { errors.push(`news-carousel: ${e.message}`);    console.error('[test] news-carousel FAILED:', e.message); }
  try { results.viral   = await testViralDemo();       } catch (e) { errors.push(`viral-demo: ${e.message}`);       console.error('[test] viral-demo FAILED:', e.message); }
  try { results.resource = await testResourceCarousel(); } catch (e) { errors.push(`resource-carousel: ${e.message}`); console.error('[test] resource-carousel FAILED:', e.message); }

  console.log('\n=== Results ===');
  for (const [type, paths] of Object.entries(results)) {
    console.log(`${type}: ${paths.length} slides`);
    for (const p of paths) console.log(`  ${p}`);
  }

  if (errors.length) {
    console.error('\n=== Errors ===');
    errors.forEach(e => console.error(' ', e));
    process.exit(1);
  } else {
    console.log('\n✓ All test renders complete. No errors.');
  }
})();
```

- [ ] **Step 7.2 — Run test renders**

```bash
node test-renders/run-test-renders.js 2>&1
```

Expected: all three post types render without errors. Output files visible in `test-renders/news-carousel/`, `test-renders/viral-demo/`, `test-renders/resource-carousel/`.

- [ ] **Step 7.3 — Confirm file counts**

```bash
node -e "
const fs = require('fs'), path = require('path');
for (const dir of ['news-carousel','viral-demo','resource-carousel']) {
  const p = path.join('test-renders', dir);
  const files = fs.existsSync(p) ? fs.readdirSync(p).filter(f => f.endsWith('.jpg')) : [];
  console.log(dir + ':', files.length, 'files');
}
"
```

Expected:
```
news-carousel: 7 files
viral-demo: 1 files
resource-carousel: 7 files
```

- [ ] **Step 7.4 — Commit**

```bash
git add test-renders/run-test-renders.js
git commit -m "test: offline render script for all three post types"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Task 1 — Type A source receipt card (slide 2), Type B dark text (slides 3+), slide number format `N / M` ✓
- [x] Task 2 — `source_name`, `source_headline` in both prompts; 12-word slide limit ✓
- [x] Task 3 — `resource-carousel.js` new module; cover matches news carousel; inner slides = Type B + label; CTA matches; SerpApi→Pexels→gradient ✓
- [x] Task 4 — "Join 100,000+ followers" deleted, not replaced ✓
- [x] Task 5 — `validatePhoto` rejects landscape/logo/small; fallback chain SerpApi→Pexels→gradient; exported and used in both modules ✓
- [x] Task 6 — `posted-stories.json` created; first-8-words key; 24h window for dedup; 48h trim; skip+next behavior ✓
- [x] Task 7 — test renders all 3 types, hardcoded mock data, saved to `test-renders/` ✓

**Placeholder scan:** None found.

**Type consistency:**
- `renderInnerSlide(data, slideNum, totalSlides, folder)` — used identically in Task 1 steps and Task 7 test
- `validatePhoto(imageUrl)` — returns `{ valid, reason?, buf? }` — used consistently in Task 5
- `renderResourceCarousel(content, folder)` — same signature in Task 3 and Task 7
- `markStoryPosted(headline)` / `isDuplicateStory(headline)` — string signatures consistent throughout Task 6
