# Brief 2 Visual & Content Quality Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply 6 targeted visual and content quality fixes to the Shadow Pages carousel rendering pipeline, updating both `news-carousel.js` and `resource-carousel.js` renderers, the GPT prompt, and the test render script.

**Architecture:** Each fix is isolated to one or two files. Fixes are applied in dependency order: rendering fixes first (Tasks 1–3), then GPT prompt + wiring changes (Task 4), then the Type B layout overhaul that depends on the new data shape (Task 5), then gradient verification + test mock update (Task 6).

**Tech Stack:** Node.js, `node-canvas` (server-side Canvas API), OpenAI GPT-4o-mini, `dotenv`

---

## File Map

| File | Tasks |
|------|-------|
| `modules/news-carousel.js` | 1, 2, 3, 4, 5 |
| `modules/resource-carousel.js` | 1, 3, 5, 6 |
| `modules/content-generator.js` | 4 |
| `test-renders/run-test-renders.js` | 6 |

---

## Task 1: Cover Gradient — Conditional Overlay

Apply the 3-stop dark overlay only when a photo was fetched. On gradient-only fallback the overlay doubles-down on an already-dark surface, degrading the look.

**Files:**
- Modify: `modules/news-carousel.js` lines 206–216 (inside `renderCoverSlide`)
- Modify: `modules/resource-carousel.js` lines 141–150 (inside `renderResourceCoverSlide`)

- [ ] **Step 1: Run baseline test renders**

```bash
node test-renders/run-test-renders.js
```
Expected: `✓ All test renders complete. No errors.` and output files in `test-renders/news-carousel/`, `test-renders/viral-demo/`, `test-renders/resource-carousel/`. If any FAIL, stop and fix the error before proceeding.

- [ ] **Step 2: Fix `renderCoverSlide` in `modules/news-carousel.js`**

Find lines 206–216 (the photo fetch + overlay block). Replace:

```js
  // Full-bleed press photo
  const img = await loadPhotoImage(d.photo_subject || d.person_name || null);
  if (img) drawImageCover(ctx, img, 0, 0, W, H);

  // Dark gradient overlay: transparent at top, rgba(0,0,0,0.75) from 50% down
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0,    'rgba(0,0,0,0.05)');
  grad.addColorStop(0.50, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1,    'rgba(0,0,0,0.85)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
```

With:

```js
  // Full-bleed press photo + overlay (only when photo is available)
  const img = await loadPhotoImage(d.photo_subject || d.person_name || null);
  if (img) {
    drawImageCover(ctx, img, 0, 0, W, H);
    // Dark gradient overlay: transparent at top → 85% opacity at bottom
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0,    'rgba(0,0,0,0.05)');
    grad.addColorStop(0.50, 'rgba(0,0,0,0.55)');
    grad.addColorStop(1,    'rgba(0,0,0,0.85)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }
```

- [ ] **Step 3: Fix `renderResourceCoverSlide` in `modules/resource-carousel.js`**

Find lines 141–150 (the photo fetch + overlay block). Replace:

```js
  // Photo — search on tool/concept from hookText
  const query = hookText.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const img   = await fetchResourcePhoto(query);
  if (img) drawImageCover(ctx, img, 0, 0, W, H);

  // Dark overlay (match news carousel cover)
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0,    'rgba(0,0,0,0.05)');
  grad.addColorStop(0.50, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1,    'rgba(0,0,0,0.85)');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
```

With:

```js
  // Photo — search on tool/concept from hookText
  const query = hookText.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const img   = await fetchResourcePhoto(query);
  if (img) {
    drawImageCover(ctx, img, 0, 0, W, H);
    // Dark overlay only when photo is present
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0,    'rgba(0,0,0,0.05)');
    grad.addColorStop(0.50, 'rgba(0,0,0,0.55)');
    grad.addColorStop(1,    'rgba(0,0,0,0.85)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  }
```

- [ ] **Step 4: Run test renders and verify**

```bash
node test-renders/run-test-renders.js
```
Expected: `✓ All test renders complete. No errors.` Cover slides should look identical when photo is fetched; gradient-only fallback should appear lighter (no double-dark overlay).

- [ ] **Step 5: Commit**

```bash
git add modules/news-carousel.js modules/resource-carousel.js
git commit -m "fix: apply cover gradient overlay only when photo is present"
```

---

## Task 2: Source Receipt Card — Resize & Restyle (Type A)

The Type A (source card) slide uses a card that is too small and its outlet name text is too small to read at a glance. Increase card dimensions and bump font sizes.

**Files:**
- Modify: `modules/news-carousel.js` lines 343–398 (Type A branch inside `renderInnerSlide`)

- [ ] **Step 1: Update card geometry and typography in `renderInnerSlide` Type A**

Find the `if (data.type === 'source') {` block (starts around line 342). Replace the entire Type A block with:

```js
  if (data.type === 'source') {
    // ── Type A: Source Receipt Card ──────────────────────────────────────────
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 0, W, H);

    // Inset card — taller and wider than before
    const cardX = 40;
    const cardY = Math.round(H * 0.20);
    const cardW = W - 80;
    const cardH = Math.round(H * 0.60);
    ctx.fillStyle = '#1a1a1a';
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(cardX, cardY, cardW, cardH);
    ctx.fill();
    ctx.stroke();

    const innerX  = cardX + 48;
    const innerW  = cardW - 96;
    let   cursorY = cardY + 56;

    // Outlet name — gold, Arial Black, 36px, all caps
    ctx.font         = `bold 36px ${FONT_DISPLAY}`;
    ctx.fillStyle    = GOLD;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(String(data.source_name || 'SOURCE').toUpperCase(), innerX, cursorY);
    cursorY += 50;

    // Thin gold divider
    ctx.save();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth   = 1;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(innerX, cursorY);
    ctx.lineTo(innerX + innerW, cursorY);
    ctx.stroke();
    ctx.restore();
    cursorY += 28;

    // Headline — white, Arial, 36px, max 3 lines
    ctx.font         = `36px ${FONT_BODY}`;
    ctx.fillStyle    = WHITE;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';
    const hLines = wrapLines(ctx, String(data.source_headline || ''), innerW).slice(0, 3);
    for (const ln of hLines) {
      ctx.fillText(ln, innerX, cursorY);
      cursorY += 48;
    }
    cursorY += 20;

    // Footer — grey "via [source] — AI News", 20px
    ctx.font         = `20px ${FONT_BODY}`;
    ctx.fillStyle    = 'rgba(255,255,255,0.40)';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`via ${String(data.source_name || 'Source')} — AI News`, innerX, cursorY);
```

Note: the `} else {` line that begins the Type B block immediately after this should remain unchanged. Only the Type A block content changes.

- [ ] **Step 2: Run test renders**

```bash
node test-renders/run-test-renders.js
```
Expected: `✓ All test renders complete. No errors.` Open `test-renders/news-carousel/slide_02.jpg` — the source card should appear taller, with a bigger outlet name.

- [ ] **Step 3: Commit**

```bash
git add modules/news-carousel.js
git commit -m "fix: resize source receipt card, bump outlet name to 36px"
```

---

## Task 3: CTA Slide — Split-Color Keyword

The CTA keyword (e.g. `"BREAKING"` or `"WORKFLOW"`) is currently rendered as one solid GOLD line. Render the surrounding text in WHITE and the keyword itself in GOLD so it pops as the action word.

**Files:**
- Modify: `modules/news-carousel.js` lines 483–496 (CTA block inside `renderCtaSlide`)
- Modify: `modules/resource-carousel.js` lines 290–299 (CTA block inside `renderResourceCtaSlide`)

- [ ] **Step 1: Update `renderCtaSlide` in `modules/news-carousel.js`**

Find the CTA block starting around line 483 that reads:
```js
  const keyword  = (ctaKeyword || 'BREAKING').toUpperCase();
  const ctaLine1 = `Comment "${keyword}" below`;
  let ctaSize = 40;
  ctx.font    = `bold ${ctaSize}px ${FONT_DISPLAY}`;
  while (ctx.measureText(ctaLine1).width > textMaxW && ctaSize > 24) {
    ctaSize -= 4;
    ctx.font = `bold ${ctaSize}px ${FONT_DISPLAY}`;
  }
  let cy = Math.round(H * 0.54);
  ctx.fillStyle    = GOLD;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(ctaLine1, W / 2, cy);
  cy += ctaSize * 1.2 + 12;
```

Replace with:

```js
  const keyword       = (ctaKeyword || 'BREAKING').toUpperCase();
  const beforeKeyword = 'Comment ';
  const keywordPart   = `"${keyword}"`;
  const afterKeyword  = ' below';
  const fullCtaLine   = `${beforeKeyword}${keywordPart}${afterKeyword}`;

  let ctaSize = 40;
  ctx.font    = `bold ${ctaSize}px ${FONT_DISPLAY}`;
  while (ctx.measureText(fullCtaLine).width > textMaxW && ctaSize > 24) {
    ctaSize -= 4;
    ctx.font = `bold ${ctaSize}px ${FONT_DISPLAY}`;
  }
  let cy = Math.round(H * 0.54);

  // Split-color render: surrounding text WHITE, quoted keyword GOLD
  ctx.font         = `bold ${ctaSize}px ${FONT_DISPLAY}`;
  ctx.textBaseline = 'top';
  ctx.textAlign    = 'left';
  const beforeW  = ctx.measureText(beforeKeyword).width;
  const keywordW = ctx.measureText(keywordPart).width;
  const afterW   = ctx.measureText(afterKeyword).width;
  const totalCtaW = beforeW + keywordW + afterW;
  let lx = W / 2 - totalCtaW / 2;

  ctx.fillStyle = WHITE;
  ctx.fillText(beforeKeyword, lx, cy);
  lx += beforeW;

  ctx.fillStyle = GOLD;
  ctx.fillText(keywordPart, lx, cy);
  lx += keywordW;

  ctx.fillStyle = WHITE;
  ctx.fillText(afterKeyword, lx, cy);

  cy += ctaSize * 1.2 + 12;
```

- [ ] **Step 2: Update `renderResourceCtaSlide` in `modules/resource-carousel.js`**

Find the CTA block starting around line 290 that reads:
```js
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
```

Replace with:

```js
  const beforeKeyword = 'Comment ';
  const keywordPart   = '"WORKFLOW"';
  const afterKeyword  = ' below';
  const fullCtaLine   = `${beforeKeyword}${keywordPart}${afterKeyword}`;

  let ctaSize = 40;
  ctx.font = `bold ${ctaSize}px ${FONT_DISPLAY}`;
  while (ctx.measureText(fullCtaLine).width > textMaxW && ctaSize > 24) {
    ctaSize -= 4; ctx.font = `bold ${ctaSize}px ${FONT_DISPLAY}`;
  }
  let cy = Math.round(H * 0.54);

  // Split-color render: surrounding text WHITE, quoted keyword GOLD
  ctx.font         = `bold ${ctaSize}px ${FONT_DISPLAY}`;
  ctx.textBaseline = 'top';
  ctx.textAlign    = 'left';
  const beforeW  = ctx.measureText(beforeKeyword).width;
  const keywordW = ctx.measureText(keywordPart).width;
  const afterW   = ctx.measureText(afterKeyword).width;
  const totalCtaW = beforeW + keywordW + afterW;
  let lx = W / 2 - totalCtaW / 2;

  ctx.fillStyle = WHITE;
  ctx.fillText(beforeKeyword, lx, cy);
  lx += beforeW;

  ctx.fillStyle = GOLD;
  ctx.fillText(keywordPart, lx, cy);
  lx += keywordW;

  ctx.fillStyle = WHITE;
  ctx.fillText(afterKeyword, lx, cy);

  cy += ctaSize * 1.2 + 12;
```

- [ ] **Step 3: Run test renders**

```bash
node test-renders/run-test-renders.js
```
Expected: `✓ All test renders complete. No errors.` Open the final CTA slides: the keyword `"BREAKING"` (news carousel) and `"WORKFLOW"` (resource carousel) should appear in GOLD while "Comment" and "below" are WHITE.

- [ ] **Step 4: Commit**

```bash
git add modules/news-carousel.js modules/resource-carousel.js
git commit -m "fix: CTA slide split-color keyword — surrounding text white, keyword gold"
```

---

## Task 4: GPT Prompt — Slides as Objects + Wiring

Update the `news_carousel` GPT prompt so `slides` is an array of objects `{label, primary, secondary}` instead of plain strings. Wire the new fields through `renderNewsCarouselV2` to `renderInnerSlide`.

**Files:**
- Modify: `modules/content-generator.js` — the `news_carousel` prompt (lines 121–208)
- Modify: `modules/news-carousel.js` — `renderNewsCarouselV2` slide mapping (lines 554–571)

- [ ] **Step 1: Update `news_carousel` prompt in `modules/content-generator.js`**

Find the `news_carousel:` key in the `PROMPTS` object (starts around line 121). Replace the entire prompt template function with:

```js
  news_carousel: (niche, topic) => `You are a viral AI news carousel writer for Instagram. Your output will be rendered as a multi-slide carousel post.

Topic: "${topic}"

HEADLINE FORMULA (cover slide):
- Must name a real person OR company AND include a specific number OR consequence
- Maximum 12 words
- Must create urgency, fear, or disbelief — never neutral
- All caps
- Examples of correct format:
  "SALESFORCE CEO SAYS ENGINEERS NO LONGER REQUIRED AS AI TAKES OVER"
  "ORACLE HAS BEGUN MAJOR LAYOFFS — UP TO 30,000 JOBS COULD BE CUT"
  "HALF OF AI DATA CENTERS PLANNED FOR 2026 HAVE BEEN DELAYED OR SCRAPPED"
  "THIS GUY BUILT AN AI AGENT THAT APPLIED TO 700 JOBS AND ACTUALLY GOT HIRED"
- Examples of WRONG format (do not use):
  "OpenAI releases new model with improved capabilities"
  "AI is changing the way we work"
  "New developments in artificial intelligence"

SUBTITLE LINE (below headline on cover):
- 6-8 words max, smaller text, describes the hook angle
- Example: "The shift that changes everything this year"

INNER SLIDES (slides array, slides 2 through N-1):
Each slide is an object with three fields:
- "label": 1-3 word category tag in ALL CAPS (e.g. "BREAKING", "CONTEXT", "IMPACT", "WHAT'S NEXT", "BIG PICTURE")
- "primary": The main bold fact — maximum 10 words, declarative statement, specific numbers/names
- "secondary": 6-10 word supporting detail or consequence — expands on primary

Rules:
- Lead with the most alarming or surprising fact first
- Include specific numbers, names, dollar amounts wherever possible
- First inner slide should be the key fact that proves the headline
- Last inner slide should be a "why this matters" or forward-looking statement
- Provide 4 to 6 inner slides
- No exclamation marks

CAPTION:
- 4-5 short paragraphs
- Start immediately with the news — no fluff opener
- Each paragraph is 1-3 sentences, punchy
- End with: "Follow us (@cuttingedgeofai) for everything latest from the AI world."
- Cite the source on the last line: "Source: [Publication]"
- No hashtag spam — max 3 relevant hashtags appended at the very end

NAMED PERSON for photo sourcing:
- Output a "photo_subject" field with the full name of the primary person in the story
- If no named person, output the company name instead
- This will be used to fetch a press photo
- Example: "photo_subject": "Sam Altman" or "photo_subject": "OpenAI"

SOURCE INFO:
- "source_name": the outlet name where this story originated (e.g. "TechCrunch", "Bloomberg", "r/ClaudeAI")
- "source_headline": the actual article or post title, max 15 words, verbatim or close paraphrase

Return ONLY valid JSON. No markdown, no code fences, no commentary:

{
  "headline": "ALL CAPS HEADLINE MAX 12 WORDS",
  "subtitle": "6-8 word subtitle describing hook angle",
  "photo_subject": "Full Name or Company",
  "source_name": "TechCrunch",
  "source_headline": "Original article title, max 15 words",
  "slides": [
    { "label": "BREAKING", "primary": "Key fact proving headline. Max 10 words.", "secondary": "Supporting detail or consequence, 6-10 words." },
    { "label": "CONTEXT", "primary": "Background that makes it bigger. Max 10 words.", "secondary": "Who or what is affected, 6-10 words." },
    { "label": "IMPACT", "primary": "Who is affected and how. Max 10 words.", "secondary": "Scale or consequence, 6-10 words." },
    { "label": "WHAT'S NEXT", "primary": "Forward-looking implication. Max 10 words.", "secondary": "Why this matters now, 6-10 words." }
  ],
  "caption": "Full Instagram caption text with paragraphs separated by newlines. End with follow instruction and source.",
  "cta_keyword": "BREAKING"
}`,
```

- [ ] **Step 2: Update `renderNewsCarouselV2` slide mapping in `modules/news-carousel.js`**

Find the inner slides loop in `renderNewsCarouselV2` (around lines 554–571). Replace:

```js
  for (let i = 0; i < innerSlides.length; i++) {
    const slideNum = i + 2;
    let slideData;
    if (i === 0) {
      // Slide 2 = Type A: Source Receipt Card
      slideData = {
        type:            'source',
        source_name:     d.source_name     || 'AI News',
        source_headline: d.source_headline || (typeof innerSlides[0] === 'string' ? innerSlides[0] : innerSlides[0]?.text) || '',
      };
    } else {
      // Slides 3+ = Type B: Dark text
      const rawSlide = innerSlides[i];
      slideData = { type: 'text', text: typeof rawSlide === 'string' ? rawSlide : (rawSlide?.text || '') };
    }
    paths.push(await renderInnerSlide(slideData, slideNum, totalSlides, folder));
    console.log(`[news-carousel-v2] Inner slide ${slideNum} done`);
  }
```

With:

```js
  for (let i = 0; i < innerSlides.length; i++) {
    const slideNum = i + 2;
    let slideData;
    if (i === 0) {
      // Slide 2 = Type A: Source Receipt Card
      slideData = {
        type:            'source',
        source_name:     d.source_name     || 'AI News',
        source_headline: d.source_headline || (typeof innerSlides[0] === 'string' ? innerSlides[0] : (innerSlides[0]?.primary || innerSlides[0]?.text || '')) || '',
      };
    } else {
      // Slides 3+ = Type B: three-layer or legacy text
      const rawSlide = innerSlides[i];
      if (typeof rawSlide === 'string') {
        // Legacy format: plain string → backward compat path
        slideData = { type: 'text', text: rawSlide };
      } else {
        // New format: object with label/primary/secondary
        slideData = {
          type:      'text',
          label:     rawSlide.label     || '',
          primary:   rawSlide.primary   || '',
          secondary: rawSlide.secondary || '',
          text:      rawSlide.text      || '',  // backward compat field preserved
        };
      }
    }
    paths.push(await renderInnerSlide(slideData, slideNum, totalSlides, folder));
    console.log(`[news-carousel-v2] Inner slide ${slideNum} done`);
  }
```

- [ ] **Step 3: Run test renders**

```bash
node test-renders/run-test-renders.js
```
Expected: `✓ All test renders complete. No errors.` The test mock data still uses plain strings for slides, so the backward compat path fires — slides should render identically to before this task.

- [ ] **Step 4: Commit**

```bash
git add modules/content-generator.js modules/news-carousel.js
git commit -m "feat: news_carousel GPT prompt returns slide objects (label/primary/secondary), wire through renderNewsCarouselV2"
```

---

## Task 5: Type B Inner Slides — Three-Layer Text + Backward Compat

Replace the single centered text block on Type B inner slides with a three-layer layout: label (top, GOLD, small letter-spaced), primary (center-dominant, white, large), secondary (below primary, GOLD, italic). Add backward compat: if `data.primary` is absent but `data.text` is present, use the old single-block rendering.

Apply to both `news-carousel.js` (`renderInnerSlide` Type B branch) and `resource-carousel.js` (`renderResourceInnerSlide`).

**Files:**
- Modify: `modules/news-carousel.js` lines 400–436 (Type B branch inside `renderInnerSlide`)
- Modify: `modules/resource-carousel.js` lines 208–263 (`renderResourceInnerSlide`)

### Sub-task A: news-carousel.js

- [ ] **Step 1: Replace Type B branch in `renderInnerSlide` (`modules/news-carousel.js`)**

Find the `} else {` block that begins the Type B section (around line 400). Replace the entire else block (up to but not including the slide counter code around line 439) with:

```js
  } else {
    // ── Type B: Dark Text Slide ──────────────────────────────────────────────
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, W, H);

    // Gold top strip
    ctx.fillStyle = GOLD;
    ctx.fillRect(0, 0, W, 4);

    const hasPrimary = data.primary && String(data.primary).trim().length > 0;

    if (!hasPrimary) {
      // ── BACKWARD COMPAT: legacy text-only slide ──────────────────────────
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
      lines = lines.slice(0, 4);

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

    } else {
      // ── NEW THREE-LAYER LAYOUT ────────────────────────────────────────────
      const textMaxW = W - 2 * (PAD + 20);

      // Layer 1: Label — GOLD, Arial Black, 16px, letter-spaced, centered at top
      const labelText    = String(data.label || 'FACT').toUpperCase();
      const labelSize    = 16;
      const labelY       = PAD + 16;
      ctx.font           = `bold ${labelSize}px ${FONT_DISPLAY}`;
      ctx.fillStyle      = GOLD;
      ctx.textBaseline   = 'top';
      ctx.textAlign      = 'left';
      const labelLetters = labelText.split('');
      const charSpacing  = 3;
      const rawLabelW    = ctx.measureText(labelText).width;
      const labelW       = rawLabelW + charSpacing * (labelLetters.length - 1);
      let   lx           = W / 2 - labelW / 2;
      for (const ch of labelLetters) {
        ctx.fillText(ch, lx, labelY);
        lx += ctx.measureText(ch).width + charSpacing;
      }

      // Layer 2: Primary — WHITE, Arial Black, large, vertically centered
      const primaryWords = String(data.primary).split(/\s+/).slice(0, 10);
      const primaryStr   = primaryWords.join(' ');

      let fontSize = 64;
      ctx.font     = `bold ${fontSize}px ${FONT_DISPLAY}`;
      let pLines   = wrapLines(ctx, primaryStr, textMaxW);
      while (pLines.length > 4 && fontSize > 36) {
        fontSize -= 4;
        ctx.font = `bold ${fontSize}px ${FONT_DISPLAY}`;
        pLines   = wrapLines(ctx, primaryStr, textMaxW);
      }
      pLines = pLines.slice(0, 4);

      const pLH     = Math.round(fontSize * 1.15);
      const pTotalH = pLines.length * pLH;

      // Center primary block vertically (offset slightly upward to leave room for secondary)
      const hasSecondary = data.secondary && String(data.secondary).trim().length > 0;
      const secondarySize = 28;
      const secondaryLH   = secondarySize * 1.35;
      const secondaryReserve = hasSecondary ? secondaryLH + 20 : 0;
      let   ty     = (H - pTotalH - secondaryReserve) / 2;

      ctx.font         = `bold ${fontSize}px ${FONT_DISPLAY}`;
      ctx.fillStyle    = WHITE;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      for (const ln of pLines) {
        ctx.fillText(ln, W / 2, ty);
        ty += pLH;
      }

      // Layer 3: Secondary — GOLD, italic Arial, 28px, below primary
      if (hasSecondary) {
        ty += 20;
        ctx.font         = `italic ${secondarySize}px ${FONT_BODY}`;
        ctx.fillStyle    = GOLD;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'top';
        const secWords = String(data.secondary).split(/\s+/).slice(0, 12);
        const secStr   = secWords.join(' ');
        const secLines = wrapLines(ctx, secStr, textMaxW).slice(0, 2);
        for (const ln of secLines) {
          ctx.fillText(ln, W / 2, ty);
          ty += secondaryLH;
        }
      }
    }
  }
```

### Sub-task B: resource-carousel.js

- [ ] **Step 2: Rewrite `renderResourceInnerSlide` in `modules/resource-carousel.js`**

The function currently takes `(text, label, slideNum, totalSlides, folder)`. Change it to take `(data, slideNum, totalSlides, folder)` where `data` can be:
- `{ label, primary, secondary }` — new three-layer format
- `{ label, text }` — backward compat (no primary → legacy single block)
- A plain string (also backward compat — treated as legacy text)

Replace the entire `renderResourceInnerSlide` function (lines 208–263) with:

```js
// ── Inner slide ───────────────────────────────────────────────────────────────
// data: { label?, primary?, secondary? } | { label?, text? } | string
async function renderResourceInnerSlide(data, slideNum, totalSlides, folder) {
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  ctx.fillStyle = '#0d0d0d'; ctx.fillRect(0, 0, W, H);

  // Gold top strip
  ctx.fillStyle = GOLD; ctx.fillRect(0, 0, W, 4);

  // Normalise: plain string → legacy compat object
  if (typeof data === 'string') data = { text: data };

  const hasPrimary  = data.primary && String(data.primary).trim().length > 0;
  const labelText   = String(data.label || 'HOW TO GUIDE').toUpperCase();
  const textMaxW    = W - 2 * (PAD + 20);

  if (!hasPrimary) {
    // ── BACKWARD COMPAT: legacy single centered text block ──────────────────
    // Draw label at top
    ctx.font = `bold 16px ${FONT_DISPLAY}`; ctx.fillStyle = GOLD;
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    const labelLetters = labelText.split('');
    const charSpacing  = 3;
    const rawLabelW    = ctx.measureText(labelText).width;
    const labelW       = rawLabelW + charSpacing * (labelLetters.length - 1);
    let   lx           = W / 2 - labelW / 2;
    const labelY       = PAD + 10;
    for (const ch of labelLetters) {
      ctx.fillText(ch, lx, labelY);
      lx += ctx.measureText(ch).width + charSpacing;
    }

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
    lines = lines.slice(0, 4);

    const lh     = Math.round(fontSize * 1.15);
    const totalH = lines.length * lh;
    let   ty     = (H - totalH) / 2;

    ctx.font = `bold ${fontSize}px ${FONT_DISPLAY}`; ctx.fillStyle = WHITE;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const ln of lines) { ctx.fillText(ln, W / 2, ty); ty += lh; }

  } else {
    // ── NEW THREE-LAYER LAYOUT ──────────────────────────────────────────────
    // Layer 1: Label — GOLD, Arial Black, 16px, letter-spaced, centered at top
    const labelSize    = 16;
    const labelY       = PAD + 16;
    ctx.font           = `bold ${labelSize}px ${FONT_DISPLAY}`;
    ctx.fillStyle      = GOLD;
    ctx.textBaseline   = 'top';
    ctx.textAlign      = 'left';
    const labelLetters = labelText.split('');
    const charSpacing  = 3;
    const rawLabelW    = ctx.measureText(labelText).width;
    const labelW       = rawLabelW + charSpacing * (labelLetters.length - 1);
    let   lx           = W / 2 - labelW / 2;
    for (const ch of labelLetters) {
      ctx.fillText(ch, lx, labelY);
      lx += ctx.measureText(ch).width + charSpacing;
    }

    // Layer 2: Primary — WHITE, Arial Black, large, vertically centered
    const primaryWords = String(data.primary).split(/\s+/).slice(0, 10);
    const primaryStr   = primaryWords.join(' ');

    let fontSize = 64;
    ctx.font     = `bold ${fontSize}px ${FONT_DISPLAY}`;
    let pLines   = wrapLines(ctx, primaryStr, textMaxW);
    while (pLines.length > 4 && fontSize > 36) {
      fontSize -= 4;
      ctx.font = `bold ${fontSize}px ${FONT_DISPLAY}`;
      pLines   = wrapLines(ctx, primaryStr, textMaxW);
    }
    pLines = pLines.slice(0, 4);

    const pLH     = Math.round(fontSize * 1.15);
    const pTotalH = pLines.length * pLH;

    const hasSecondary    = data.secondary && String(data.secondary).trim().length > 0;
    const secondarySize   = 28;
    const secondaryLH     = secondarySize * 1.35;
    const secondaryReserve = hasSecondary ? secondaryLH + 20 : 0;
    let   ty = (H - pTotalH - secondaryReserve) / 2;

    ctx.font = `bold ${fontSize}px ${FONT_DISPLAY}`; ctx.fillStyle = WHITE;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const ln of pLines) { ctx.fillText(ln, W / 2, ty); ty += pLH; }

    // Layer 3: Secondary — GOLD, italic Arial, 28px, below primary
    if (hasSecondary) {
      ty += 20;
      ctx.font = `italic ${secondarySize}px ${FONT_BODY}`; ctx.fillStyle = GOLD;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const secWords = String(data.secondary).split(/\s+/).slice(0, 12);
      const secStr   = secWords.join(' ');
      const secLines = wrapLines(ctx, secStr, textMaxW).slice(0, 2);
      for (const ln of secLines) { ctx.fillText(ln, W / 2, ty); ty += secondaryLH; }
    }
  }

  // Slide counter
  ctx.font = `14px "Courier New", monospace`; ctx.fillStyle = 'rgba(255,255,255,0.20)';
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillText(`${slideNum} / ${totalSlides}`, W - PAD, H - PAD);

  return saveCanvas(canvas, path.join(folder, `slide_${String(slideNum).padStart(2, '0')}.jpg`));
}
```

- [ ] **Step 3: Update `renderResourceCarousel` call site in `modules/resource-carousel.js`**

Find the inner slide rendering loop in `renderResourceCarousel` (around line 341). Replace:

```js
  for (let i = 0; i < innerCount; i++) {
    const slideData = slides[i];
    const text = typeof slideData === 'string'
      ? slideData
      : (slideData?.one_liner || slideData?.stat || slideData?.text || '');
    paths.push(await renderResourceInnerSlide(text, label, i + 2, totalSlides, folder));
    console.log(`[resource-carousel] Inner slide ${i + 2} done`);
  }
```

With:

```js
  for (let i = 0; i < innerCount; i++) {
    const slideData = slides[i];
    let slideObj;
    if (typeof slideData === 'string') {
      // Legacy plain string
      slideObj = { label, text: slideData };
    } else if (slideData?.primary) {
      // New object format
      slideObj = {
        label:     slideData.label     || label,
        primary:   slideData.primary   || '',
        secondary: slideData.secondary || '',
      };
    } else {
      // Object without primary — backward compat
      slideObj = {
        label,
        text: slideData?.one_liner || slideData?.stat || slideData?.text || '',
      };
    }
    paths.push(await renderResourceInnerSlide(slideObj, i + 2, totalSlides, folder));
    console.log(`[resource-carousel] Inner slide ${i + 2} done`);
  }
```

- [ ] **Step 4: Run test renders — verify backward compat fires correctly**

```bash
node test-renders/run-test-renders.js
```
Expected: `✓ All test renders complete. No errors.` The test mocks use plain strings and objects without `primary`, so the backward compat path fires for all Type B slides. Open any inner slide image — it should still show the centered white text block (old layout), NOT the three-layer layout. This confirms backward compat is working.

- [ ] **Step 5: Commit**

```bash
git add modules/news-carousel.js modules/resource-carousel.js
git commit -m "feat: Type B three-layer layout (label/primary/secondary) with backward compat for text-only slides"
```

---

## Task 6: Resource Cover Gradient Verify + Test Mock Update

Verify the resource-carousel gradient fallback matches news-carousel spec (both already use `#0d0d0d → #1a1a1a`). Then update the test mock data to exercise the new slide object format so the three-layer layout is actually tested.

**Files:**
- Read-verify: `modules/resource-carousel.js` lines 133–138
- Modify: `test-renders/run-test-renders.js` — `testNewsCarousel` and `testResourceCarousel` mock data

- [ ] **Step 1: Verify resource-carousel gradient matches news-carousel**

Read lines 133–138 of `modules/resource-carousel.js`. Confirm the base gradient reads:
```js
base.addColorStop(0, '#0d0d0d'); base.addColorStop(1, '#1a1a1a');
```
And lines 200–204 of `modules/news-carousel.js` read:
```js
fallbackGrad.addColorStop(0, '#0d0d0d');
fallbackGrad.addColorStop(1, '#1a1a1a');
```
These already match. No code change needed for this sub-step.

- [ ] **Step 2: Update news carousel mock data in `test-renders/run-test-renders.js`**

Find the `mockGpt.slides` array in `testNewsCarousel` (lines 28–35). Replace:

```js
    slides: [
      'GPT-5 launches Q3 2026 per OpenAI',
      'Context window triples to 300k tokens',
      'Reasoning beats o3 by 40 percent',
      'Enterprise pricing double GPT-4o',
      'All ChatGPT Plus users get access day one',
    ],
```

With:

```js
    slides: [
      'GPT-5 launches Q3 2026 per OpenAI',  // slide[0] is used by Type A (source card) — keep as string
      { label: 'CONTEXT',    primary: 'Context window triples to 300k tokens',  secondary: '10x larger than GPT-4o context' },
      { label: 'PERFORMANCE', primary: 'Reasoning beats o3 by 40 percent',      secondary: 'Highest score on MMLU and HumanEval' },
      { label: 'PRICING',    primary: 'Enterprise pricing double GPT-4o',       secondary: 'Plus users get day-one access' },
      { label: "WHAT'S NEXT", primary: 'All ChatGPT Plus users get access day one', secondary: 'API rollout follows two weeks later' },
    ],
```

- [ ] **Step 3: Update resource carousel mock data in `test-renders/run-test-renders.js`**

Find the `mock.slides` array in `testResourceCarousel` (lines 69–75). Replace:

```js
    slides: [
      'Dump your full task list into Claude first',
      'Sort by impact then by time required',
      'Build schedule around top three tasks',
      'Draft your hardest email with AI help',
      'Review outputs before touching inbox',
    ],
```

With:

```js
    slides: [
      { label: 'STEP 1',  primary: 'Dump your full task list into Claude', secondary: 'Use a daily brain dump prompt' },
      { label: 'STEP 2',  primary: 'Sort by impact then by time required', secondary: 'Focus on top 3 high-leverage items' },
      { label: 'STEP 3',  primary: 'Build schedule around top three tasks', secondary: 'Block deep work time before inbox' },
      { label: 'STEP 4',  primary: 'Draft your hardest email with AI help', secondary: 'Give Claude the context and the ask' },
      { label: 'STEP 5',  primary: 'Review outputs before touching inbox', secondary: 'Protect the first 90 minutes daily' },
    ],
```

- [ ] **Step 4: Run test renders — verify three-layer layout renders**

```bash
node test-renders/run-test-renders.js
```
Expected: `✓ All test renders complete. No errors.` Open `test-renders/news-carousel/slide_03.jpg` (or any inner slide past slide 2) — it should show three layers: GOLD label at top, large white primary text centered, GOLD italic secondary below. Open `test-renders/resource-carousel/slide_02.jpg` — same three-layer layout with "STEP 1" label.

- [ ] **Step 5: Commit**

```bash
git add test-renders/run-test-renders.js
git commit -m "test: update mock data to use slide objects, exercising three-layer Type B layout"
```

---

## Self-Review Checklist

**Spec coverage:**
- Fix 1 (gradient conditional): Task 1 ✓
- Fix 2 (Type B three-layer + backward compat): Task 5 ✓
- Fix 3 (source card resize): Task 2 ✓
- Fix 4 (CTA split-color keyword): Task 3 ✓
- Fix 5 (GPT prompt slide objects): Task 4 ✓
- Fix 6 (resource cover gradient verify): Task 6 ✓
- Backward compat addition (user requirement): Tasks 4+5 ✓

**No placeholders:** All code blocks are complete and runnable.

**Type consistency:**
- `renderInnerSlide` receives `{ type, label?, primary?, secondary?, text? }` — same shape used in Tasks 4, 5 ✓
- `renderResourceInnerSlide` receives `data` object with same shape — used in Tasks 5, 6 ✓
- `renderResourceCarousel` call site updated in same task as function signature change (Task 5) ✓
