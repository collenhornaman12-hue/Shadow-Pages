# Shadow Pages — Lessons Learned

## Bug 1 — Wrong photo on news hook image (2026-03-25)

**Root cause:**
`findPhoto()` in `news-fetcher.js` had an incomplete fallback chain. It searched Pexels correctly by person name, but if Pexels returned no result it fell back to a generic "artificial intelligence technology" query — returning completely unrelated images (e.g. terracotta warriors for "Jensen Huang"). Additionally, when the returned URL (e.g. a Wikipedia hotlink) failed to load in `image-renderer.js`, the fallback query was `story.person + ' portrait'`, transforming the person name rather than passing it directly.

**Fix applied:**
- Extended `findPhoto(person, storyTitle)` in `news-fetcher.js` with the full fallback chain: PHOTO_LIBRARY → Pexels (person name, no transformation) → Unsplash (person name) → Bing (person name) → DALL-E 3 (contextual scene using story headline — not the person's face) → null (gradient).
- Exported `findPhoto` so it can be tested in isolation.
- In `fetchTopStories()`, passes `s.title` as the second argument to `findPhoto` for use in the DALL-E 3 prompt.
- Fixed the fallback query in `renderNewsCarousel` and `renderNewsHookImage` in `image-renderer.js` to use `story.person` directly (no " portrait" suffix).
- Added `console.log` on every render step logging which photo source was used.
- Updated `fetchPhotoWithFallback` in `image-renderer.js` with the same DALL-E prompt style (cinematic scene, no people) and source logging.
- Also fixed `content-generator.js` (not in scope but blocking tests): added code-fence stripping (`replace(/^```(?:json)?\n?/, '')`) before `JSON.parse` — GPT was wrapping JSON in markdown blocks causing silent retry failures.

**Verified 2026-03-25:** `findPhoto('Jensen Huang')` → PHOTO_LIBRARY hit, correct Wikipedia URL returned. Integration test with "Melania Trump" story → pexels source, correct photo loaded.

---

## Bug 2 — Dead black zones on content slides (2026-03-25)

**Root cause:**
News carousel slides 2–6 in `renderNewsCarousel()` in `image-renderer.js` used a three-zone layout: a horizontal rule at `H * 0.20` (top band) and another at `H * 0.80` (bottom band), with text only occupying the middle 60%. This left ~210px of empty black canvas above and below the text on every content slide.

**Fix applied:**
Rewrote the slides 2–6 loop in `renderNewsCarousel`:
- Removed both horizontal rules entirely.
- Full canvas fill: `#0d0d0d` (no zones).
- Gold 4px bar at top only, full width.
- Slide counter top-right: Arial Black bold, 28px, `#E8C547` (was 16px grey).
- Punchy fact text vertically and horizontally centered in the full remaining canvas: dynamic font size — `<60 chars → 72px`, `60–100 chars → 56px`, `>100 chars → 44px` — with word wrap and max width 80%.
- Source credit bottom-left: Arial 22px, `#888888` (no dead bottom band).

**Verified 2026-03-25:** Full 7-slide carousel rendered for "Melania Trump wants a robot to homeschool your child". Slides 2–6 confirmed: full `#0d0d0d` canvas, gold top bar, text vertically/horizontally centered, no dead zones.

---

## Feature — News carousel 7-slide visual overhaul (2026-04-01)

**What was built:**
Replaced the flat news carousel renderer with a gold-standard 7-slide layout for @CuttingEdgeOfAI.

**Files created/modified:**
- `modules/news-carousel-legacy.js` — thin wrapper re-exporting `renderNewsCarousel` from `image-renderer.js`. Never touch this.
- `modules/news-carousel.js` — new primary renderer. Exports `renderNewsCarouselV2(story, gptData, outputFolder)`. Renders all 7 slides at 1080×1080 using node-canvas with Arial Black / Impact fonts and full Pexels photo fetch on slides 1, 2, 3, 6.
- `modules/content-generator.js` — added `news_carousel` prompt type. Returns 7-slide JSON object.
- `orchestrator.js` — news-carousel slot now calls `generateContent('news_carousel', ...)` for gptData, tries `renderNewsCarouselV2`, falls back to `renderNewsCarouselLegacy` on any error.

**Photo fetch rule (DO NOT change):**
Person names are passed raw to `fetchSlideImage` — no slug transformation, no appending " portrait", no lowercasing.

**Slide layout summary:**
- Slide 1: full-bleed photo, two gradient overlays, bottom-left text stack (breaking → headline → sub → swipe)
- Slide 2: photo top 40%, gold tag bar, 3 stats with number/divider/copy layout
- Slide 3: photo top 46%, large quote with word-level gold highlighting, attribution chip
- Slide 4: gold header block, 3 numbered reasons
- Slide 5: two-column split (gold left / blue-purple right), header + footer bars
- Slide 6: full-bleed photo, subtle grid overlay, 3-line headline white/gold/red
- Slide 7: dark bg, gold top strip, 4-line headline, gold CTA box with PROMPTS keyword

---

## Bug 3 — Resource carousel not saving to output folder (2026-03-25)

**Root cause:**
`generateResourceCarousel()` in `resource-generator.js` only generated GPT slide content and returned a data object. The image rendering (`renderResourceCarousel`) was called separately in `orchestrator.js`. Because the rendering was never called standalone, the function had no file output when tested in isolation — and a cache hit returned early, skipping rendering entirely.

**Fix applied:**
- Added `require('./image-renderer')` import to `resource-generator.js`.
- At the end of `generateResourceCarousel()`, always call `renderResourceCarousel(content, folder)` and `getOutputFolder(...)` regardless of whether content came from cache or GPT — so images are always written on every call.
- Wrapped the render call in `try/catch` with `console.error` on failure.
- Logs all 7 saved file paths to console.
- Returns `{ ...content, paths }` so callers have the file paths.
- Updated `orchestrator.js` to use `resource.paths` from the returned object instead of calling `renderResourceCarousel` a second time (which would have double-rendered).

**Verified 2026-03-25:** `generateResourceCarousel()` called in isolation → 7 files written to `output\`. Integration test also confirmed: resource carousel saves 7 files on both cache-hit and fresh GPT generation paths.

---

## Content Quality Overhaul — April 2026

Reference accounts studied: @evolving.ai (4.3M), @artificialintelligenceee (703K)

Key formula locked:
- Cover slide = named person/company + specific number + consequence, all caps, Impact font, bottom 40% of canvas
- Full-bleed press photo behind dark gradient overlay
- SWIPE badge gold (#E8C547) bottom right on all carousels
- CTA final slide on every carousel with keyword trigger "BREAKING"
- 7am slot changed from motivational quote to viral AI demo post sourced from Reddit top posts

Photo sourcing hierarchy:
1. Google Custom Search API using photo_subject field (named individual or company) — env vars: GOOGLE_CSE_API_KEY, GOOGLE_CSE_CX
2. Pexels for generic imagery
3. Dark gradient fallback if both fail

Post type rotation:
- 7am: viral_demo (Reddit-sourced)
- 12pm: news_carousel
- 6pm: resource_carousel
- 9pm: news_carousel

News carousel format change (April 2026):
- GPT now returns simpler JSON: { headline, subtitle, photo_subject, slides[], caption, cta_keyword }
- Cover slide: 1080x1350 portrait, full-bleed press photo, watermark top-center, headline centered in bottom 40%
- Inner slides: text-only on dark background (#0a0a0a), gold top strip, auto-sized font
- CTA final slide replaces old slide 7: "WANT THE LATEST AI NEWS EVERY DAY?" + follow CTA + account handle + stan.store link
- Caption sourced from GPT inline (gptData.caption), falls back to caption-generator if absent
- Canvas size changed from 1080x1080 to 1080x1350 (4:5 portrait) for all carousel slides

---

## Brief 4 complete [2026-04-09]

- Seed filter added to seed-bank-generator.js — rejects banned hook patterns after parse, before json write. Rejections and timestamps logged to memory/seed-filter-log.txt.
- Filter validation: known-bad test seed confirmed rejected (matched "effortlessly" pattern).
- Curly/smart quote normalization added to isValidSeed — GPT output uses curly apostrophes; normalized to straight before pattern matching.
- CTA keywords wired by post type from within each generator: news=BREAKING, resource=PROMPTS, viral=WORKFLOW
- Both visible keyword text (split-color CTA line) and ghost keyword layer (96px, 4% opacity) driven by same ctaKeyword param.
- CTA copy updated per type: news asks for daily drops, resource offers prompt stack, viral offers DM workflow.
- ctaLines2 "and we'll send you..." removed from both CTA functions.
- Handle updated to lowercase @cuttingedgeofai in both CTA functions.
- Files changed: scripts/seed-bank-generator.js, modules/news-carousel.js, modules/resource-carousel.js, test-renders/run-test-renders.js
- Seed count from test run: 27/30 valid seeds (3 rejected by filter)

---

## Brief 5 complete [2026-04-09]

- config/accounts.js created with both account configs (cuttingedgeofai + wealthyedge)
- orchestrator-wealthy.js created for @edgeofthewealthy
- PM2 schedule: 8am viral demo / 1pm news carousel / 5pm resource carousel / 8pm news carousel
- Wealth niche GPT context wired into all generation calls via WEALTH_SYSTEM_PROMPT system message
- Wealth RSS feeds: Bloomberg markets, Business Insider markets, Forbes (403 — unreliable).
  Fallback: Yahoo Finance, CNBC.
- Feed failure handling: falls back to secondary feeds automatically; logs and skips slot if all fail
- Forbes feed currently returns 403 — Bloomberg + Business Insider are carrying the slot
- Custom wealth CTA slide renderer (renderWealthCtaSlide) renders @edgeofthewealthy handle;
  does not modify existing news-carousel.js (additive only)
- Separate duplicate prevention file: memory/posted-stories-wealthy.json (never touches CuttingEdge's file)
- fixCaptionHandle() post-processes shared module output to replace AI handles/hashtags with wealth equivalents
- AUDIENCE_PSYCHOLOGY_WEALTHY.md not yet created — using SOUL.md fallback
  ACTION REQUIRED NEXT SESSION: Create memory/AUDIENCE_PSYCHOLOGY_WEALTHY.md
- Test post carousel ID: 18098680996838307
- Test post hook ID: 17959137753073649
- IG_TOKEN_WEALTHYEDGE expires ~June 8 2026 — set renewal reminder
- Files changed: config/accounts.js (created), orchestrator-wealthy.js (created),
  ecosystem.config.js (added shadow-pages-wealthy entry), .env (IG_ACCOUNT_ID_WEALTHYEDGE +
  IG_TOKEN_WEALTHYEDGE added in previous session)
