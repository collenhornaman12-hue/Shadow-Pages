# Shadow Pages — Task Log

## Completed 2026-03-24

### AI News Pipeline — @CuttingEdgeOfAI

**Built:**
- `modules/news-fetcher.js` — fetches from 3 RSS feeds (TechCrunch AI, The Verge AI, Wired AI), deduplicates by title, scores via GPT-4o-mini, returns top 2 story objects with Pexels photo lookup
- `modules/resource-generator.js` — generates 5 AI productivity prompts by subcategory (writing/research/coding/marketing/learning, cycled daily), caches to `cache/resource-cache.json` by date
- `cache/resource-cache.json` — created (empty on init, auto-populated on first run)
- `.gitignore` — created (covers .env, node_modules, cache/, logs/, temp images/video)
- `rss-parser` npm package installed

**Updated:**
- `orchestrator.js` — new `FORMAT_SCHEDULE` routes 4 slots:
  - Slot 0 (7am) → quote (unchanged)
  - Slot 1 (12pm) → news-carousel (story[0])
  - Slot 2 (6pm) → resource-carousel
  - Slot 3 (9pm) → news-carousel (story[1])
  - `getNewsStories()` caches fetchTopStories() in memory for the day (shared slots 1+3)

---

## Completed 2026-03-25

### Visual Redesign — image-renderer.js (complete rebuild)

**Rebuilt from scratch:**
- `modules/image-renderer.js` — full rewrite using `node-canvas` (installed); all old SVG/sharp rendering removed
- `canvas` npm package installed

**New exports:**
- `renderQuoteSlide(text)` — 1080×1080, flat #0a0a0a bg, horizontal rules at 35%/65%, dynamic font size (88/68/52px by char count), strips `!`, fits text between rules
- `renderNewsCarousel(story)` — 7 slides: split-column hook (person photo left, gold accent bar + headline right), 5 dark content slides (gold top bar, slide counter, body text), gold CTA slide with dot-grid texture
- `renderResourceCarousel(slides)` — 7 slides: full-bleed photo hook with gradient overlay, 5 cream/dark two-zone prompt slides (large `"` in gold), photo CTA slide
- `renderQuoteImage()` — legacy shim kept for `carousel-builder.js` compatibility

**Aesthetic models:** @evolving.ai (quote), @artificialintelligenceee (news), @wealthypot (resource)

**Tested:** all 15 images rendered successfully to temp files (no publish).

---

---

## Completed 2026-03-25 (session 2)

### 6-task overhaul

**Task 1 — Photo fallback chain + brand logo:**
- `modules/image-renderer.js`: `fetchPhotoWithFallback(query, orientation)` — 4-step chain: Pexels → Unsplash → Bing Image Search → DALL-E 3 → gradient fill
- Applied to all photo fetches: news carousel slide 1, hook image, resource carousel hook/CTA
- `fetchAndSaveBrandLogo()` fetches IG profile picture via Graph API, saves to `assets/brand-logo.png`
- `assets/brand-logo.png` created (IG API fetch succeeded)
- Brand logo rendered 48×48px, 20px from top-left on all slides; text fallback `@cuttingedgeofai` if PNG fails
- `.env` updated with `UNSPLASH_ACCESS_KEY=` and `BING_SEARCH_API_KEY=` (keys pending)

**Task 2 — News scoring prompt:**
- `modules/news-fetcher.js`: replaced GPT scoring prompt with viral/clickbait rubric
- Scorer now returns `hook_angle` field; included in returned story objects (replaces `summary`)

**Task 3 — Carousel and quote copy quality:**
- `modules/content-generator.js`: replaced `PROMPTS.carousel` with 5-slide breaking news fact prompt (returns JSON array of 5 strings)
- Replaced `PROMPTS.quote` with PROVOCATIVE/INSPIRATIONAL dual-tone prompt (max 12 words)
- `sanitizeSlides('carousel', data)` handles both old object format and new array format

**Task 4 — News hook image:**
- `renderNewsHookImage(story, folder?)` — 1080×1350 portrait: full-bleed photo top 60%, gold divider with pill, dark bottom zone with source + headline
- Orchestrator slots 1 & 3: post hook image first (caption uses `hook_angle`), then carousel second; both share same output folder

**Task 5 — Resource carousel rotation:**
- `modules/resource-generator.js`: full rewrite with `POST_TYPES[dayOfYear%8]` rotation and `SUBCATEGORIES[dayOfYear%5]` subcategory rotation
- 4 post types: `copy-paste-prompts`, `tool-spotlight`, `how-to-guide`, `stat-carousel` — each with tailored GPT prompt, hook text, CTA
- Returns `{ post_type, hook_text, slides, caption_cta }`
- `renderResourceCarousel` handles all 4 types: stat-carousel uses dark design with source label; tool-spotlight shows tool name + wow_factor; others use cream/dark 2-zone
- `modules/caption-generator.js`: appends `options.caption_cta` to generated caption if present

**Task 6 — Output folder organisation:**
- All images saved to `C:\Users\colle\shadow-pages\output\YYYY-MM-DD_HH-MM_[type]_[topic-slug]\`
- `getOutputFolder(type, topic)` exported from image-renderer.js; handles collisions with `_2`, `_3` suffix
- Orchestrator updated for quote, news-carousel, resource-carousel to use structured output folders

---

## Completed 2026-03-25 (session 3) — Bug fixes

### Bug 1 — Wrong photo on news hook image ✅
- `modules/news-fetcher.js`: Extended `findPhoto(person, storyTitle)` with full fallback chain (PHOTO_LIBRARY → Pexels → Unsplash → Bing → DALL-E 3 scene → null/gradient). Exported `findPhoto`. Passes `s.title` to DALL-E for contextual scene. Logs source on every call.
- `modules/image-renderer.js`: Removed `' portrait'` suffix from person query fallback. Added source logging to `fetchPhotoWithFallback`. Updated DALL-E 3 prompt to cinematic scene (no people). Added load-success logging in `renderNewsHookImage` and `renderNewsCarousel`.
- `modules/content-generator.js`: Fixed JSON parse — strip markdown code fences before `JSON.parse` (GPT was wrapping output in ```json blocks, causing retry failures).

### Bug 2 — Dead black zones on content slides ✅
- `modules/image-renderer.js`: Rewrote slides 2–6 layout in `renderNewsCarousel`. Removed three-zone horizontal rules. Full dark canvas. Counter 28px GOLD Arial Black. Text centered full-canvas with dynamic font (72/56/44px by char count). Source credit bottom-left 22px #888888.

### Bug 3 — Resource carousel not saving to output folder ✅
- `modules/resource-generator.js`: Added `renderResourceCarousel` + `getOutputFolder` import. `generateResourceCarousel` now always renders 7 images (cache hit or fresh), saves to `output/`, logs file paths, returns `{ ...content, paths }`.
- `orchestrator.js`: Removed duplicate `renderResourceCarousel` call; uses `resource.paths` from returned object. Removed unused `renderResourceCarousel` import.

## Verified 2026-03-25 (session 4) — Integration tests passed

### Bug 1 — Isolation test ✅
- `node -e "const { findPhoto } = require('./modules/news-fetcher'); findPhoto('Jensen Huang').then(console.log)"`
- Result: PHOTO_LIBRARY hit → correct Wikipedia URL returned, logged `[findPhoto] Source: photo-library — "Jensen Huang"`

### Bug 2 — Full carousel render ✅
- 7-slide news carousel rendered with story "Melania Trump wants a robot to homeschool your child"
- Slides 2–6 confirmed: full `#0d0d0d` canvas, gold 4px top bar, text centered, no dead zones

### Bug 3 — Isolation test ✅
- `node -e "const { generateResourceCarousel } = require('./modules/resource-generator'); generateResourceCarousel()"`
- Result: 7 files written to `output\2026-03-25_23-39_resource_5-ai-prompts\`

### Full Slot 1 integration test ✅
- `fetchTopStories()` returned story with named person: "Melania Trump"
- Photo source: pexels (person name query direct, no transformation)
- Hook image rendered → `output\2026-03-25_23-40_news_melania-trump-wants\hook.jpg`
- News carousel 7 slides → `output\2026-03-25_23-40_news_melania-trump-wants\slide_01..07.jpg`
- Resource carousel 7 slides → `output\2026-03-25_23-40_resource_5-ai-prompts\slide_01..07.jpg`
- Total: 22 files in output\. Nothing published. Scheduler not triggered.

## Needs Manual Action

- **Add `PEXELS_API_KEY` to `.env`** — already set ✓
- **Add `UNSPLASH_ACCESS_KEY` to `.env`** — get free key at unsplash.com/developers
- **Add `BING_SEARCH_API_KEY` to `.env`** — get free key at portal.azure.com (Bing Search v7)
