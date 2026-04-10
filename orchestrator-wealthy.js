require('dotenv').config();

// ── Env var validation ────────────────────────────────────────────────────────
if (!process.env.IG_ACCOUNT_ID_WEALTHYEDGE || !process.env.IG_TOKEN_WEALTHYEDGE) {
  console.error('Missing env var: IG_ACCOUNT_ID_WEALTHYEDGE or IG_TOKEN_WEALTHYEDGE — check .env file');
  process.exit(1);
}

const TEST_MODE = process.env.TEST_MODE === 'true';
if (TEST_MODE) {
  console.log('[wealthy-test] TEST MODE — will publish one real post to @edgeofthewealthy then exit');
}

// ── Imports ───────────────────────────────────────────────────────────────────
const fs   = require('fs');
const path = require('path');
const cron = require('node-cron');
const Parser = require('rss-parser');
const OpenAI = require('openai');

const { upload }                              = require('./modules/uploader');
const { postImage, postCarousel }             = require('./modules/instagram-publisher');
const { generateCaption }                     = require('./modules/caption-generator');
const { logError }                            = require('./modules/logger');
const { renderCoverSlide, renderInnerSlide }  = require('./modules/news-carousel');
const { renderNewsCarouselLegacy }            = require('./modules/news-carousel-legacy');
const { createCanvas, registerFont }          = require('canvas');
const { renderNewsHookImage, getOutputFolder } = require('./modules/image-renderer');
const { generateViralDemoPost }               = require('./modules/viral-demo-generator');
const { TokenLimitExceededError }             = require('./modules/content-generator');
const { renderResourceCarousel }              = require('./modules/resource-carousel');

const { wealthyedge: account } = require('./config/accounts');

// ── Wealth watermark ──────────────────────────────────────────────────────────
const WEALTH_WATERMARK = 'EDGE OF THE WEALTHY';

// ── Wealth GPT system prompt ──────────────────────────────────────────────────
const WEALTH_SYSTEM_PROMPT = 'Ignore any AI-specific content direction. This account covers wealth mindset, luxury lifestyle, financial independence, and the strategies high-net-worth individuals use to build and preserve wealth. Content tone is aspirational, authoritative, and exclusive.';

// ── Wealth CTA slide renderer ─────────────────────────────────────────────────
// Additive — does not modify news-carousel.js. Renders @edgeofthewealthy handle.
const W_CANVAS = 1080;
const H_CANVAS = 1350;
const GOLD     = '#E8C547';
const BG_COLOR = '#0d0d0d';
const WHITE    = '#ffffff';
const FONT_D   = '"Arial Black", Impact, Arial, sans-serif';
const FONT_B   = 'Arial, sans-serif';
const pad      = 40;

// Register fonts once (same as news-carousel.js)
for (const f of [
  { path: 'C:/Windows/Fonts/ariblk.ttf', family: 'Arial Black' },
  { path: 'C:/Windows/Fonts/impact.ttf',  family: 'Impact' },
]) {
  try { if (fs.existsSync(f.path)) registerFont(f.path, { family: f.family }); }
  catch (_) {}
}

function saveCanvas(canvas, outPath) {
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outPath, canvas.toBuffer('image/jpeg', { quality: 0.93 }));
  return outPath;
}

async function renderWealthCtaSlide(ctaKeyword, folder, slideNum, totalSlides) {
  const canvas  = createCanvas(W_CANVAS, H_CANVAS);
  const ctx     = canvas.getContext('2d');
  const keyword  = (ctaKeyword || 'BREAKING').toUpperCase();
  const textMaxW = W_CANVAS - pad * 2;

  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, W_CANVAS, H_CANVAS);

  // Ghost keyword watermark
  ctx.save();
  ctx.globalAlpha = 0.04;
  ctx.font = `bold 96px ${FONT_D}`;
  ctx.fillStyle = WHITE;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(keyword, W_CANVAS / 2, H_CANVAS / 2);
  ctx.restore();

  // Gold accent bar
  ctx.fillStyle = GOLD;
  ctx.fillRect(pad, Math.round(H_CANVAS * 0.18), W_CANVAS - pad * 2, 3);

  // Hook line
  ctx.font = `bold 44px ${FONT_D}`;
  ctx.fillStyle = WHITE;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('WANT THE FULL BREAKDOWN?', W_CANVAS / 2, Math.round(H_CANVAS * 0.22));

  // CTA instruction
  const beforeKw = 'Comment ';
  const kwPart   = `"${keyword}"`;
  const afterKw  = ' for daily drops';
  const fullCta  = `${beforeKw}${kwPart}${afterKw}`;
  let ctaSize    = 40;
  ctx.font       = `bold ${ctaSize}px ${FONT_D}`;
  while (ctx.measureText(fullCta).width > textMaxW && ctaSize > 24) {
    ctaSize -= 4;
    ctx.font = `bold ${ctaSize}px ${FONT_D}`;
  }
  const cy       = Math.round(H_CANVAS * 0.54);
  const beforeW  = ctx.measureText(beforeKw).width;
  const kwW      = ctx.measureText(kwPart).width;
  const afterW   = ctx.measureText(afterKw).width;
  const totalCtaW = beforeW + kwW + afterW;
  let lx = W_CANVAS / 2 - totalCtaW / 2;

  ctx.fillStyle = WHITE;
  ctx.textAlign = 'left';
  ctx.fillText(beforeKw, lx, cy);
  lx += beforeW;
  ctx.fillStyle = GOLD;
  ctx.fillText(kwPart, lx, cy);
  lx += kwW;
  ctx.fillStyle = WHITE;
  ctx.fillText(afterKw, lx, cy);

  // Handle and store link — wealth account
  const bottomY = H_CANVAS - pad - 80;
  ctx.font         = `bold 28px ${FONT_D}`;
  ctx.fillStyle    = WHITE;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('@edgeofthewealthy', W_CANVAS / 2, bottomY);

  ctx.font         = `22px ${FONT_B}`;
  ctx.fillStyle    = GOLD;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('stan.store/cuttingedgeofai', W_CANVAS / 2, bottomY + 40);

  // Slide counter
  ctx.font      = `14px "Courier New", monospace`;
  ctx.fillStyle = '#555';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${slideNum}/${totalSlides}`, W_CANVAS - pad, H_CANVAS - pad);

  const filename = `slide_${String(slideNum).padStart(2, '0')}_cta.jpg`;
  return saveCanvas(canvas, path.join(folder, filename));
}

// ── Wealth inner slide renderer (Brief 7 — isolated from @CuttingEdgeOfAI) ───
// Pattern B: dark narrative. Left-aligned body copy, bold opening sentence,
// regular-weight follow-on sentences. No label tags, no italic subtitles.
// Reads `body` field from GPT output. Falls back to `primary` for legacy data.

function wrapLinesWealth(ctx, text, maxWidth) {
  const words = String(text || '').split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function renderWealthInnerSlide(data, slideNum, totalSlides, folder) {
  const canvas = createCanvas(W_CANVAS, H_CANVAS);
  const ctx    = canvas.getContext('2d');

  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, W_CANVAS, H_CANVAS);

  // Gold accent strip at top
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, 0, W_CANVAS, 4);

  const body      = String(data.body || data.primary || data.text || '');
  const leftX     = 60;
  const rightX    = W_CANVAS - 60;
  const maxWidth  = rightX - leftX;
  let   cursorY   = 80;

  // Split at first sentence boundary: bold opener, regular follow-on
  const firstStop = body.search(/\.\s+/);
  let boldPart = '';
  let restPart = '';
  if (firstStop !== -1) {
    boldPart = body.slice(0, firstStop + 1).trim();
    restPart = body.slice(firstStop + 1).trim();
  } else {
    boldPart = body;
    restPart = '';
  }

  // Bold opening sentence — 40px Arial Black
  const boldSize = 40;
  const boldLH   = Math.round(boldSize * 1.4);
  ctx.font         = `bold ${boldSize}px ${FONT_D}`;
  ctx.fillStyle    = WHITE;
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'top';
  for (const line of wrapLinesWealth(ctx, boldPart, maxWidth)) {
    ctx.fillText(line, leftX, cursorY);
    cursorY += boldLH;
  }

  // Regular follow-on sentences — 32px Arial, slightly dimmed
  if (restPart) {
    cursorY += 16;
    const bodySize = 32;
    const bodyLH   = Math.round(bodySize * 1.55);
    ctx.font      = `${bodySize}px ${FONT_B}`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const line of wrapLinesWealth(ctx, restPart, maxWidth)) {
      ctx.fillText(line, leftX, cursorY);
      cursorY += bodyLH;
    }
  }

  // Slide counter — faded bottom-right
  ctx.font         = `14px "Courier New", monospace`;
  ctx.fillStyle    = 'rgba(255,255,255,0.20)';
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${slideNum} / ${totalSlides}`, W_CANVAS - pad, H_CANVAS - pad);

  const filename = `slide_${String(slideNum).padStart(2, '0')}.jpg`;
  return saveCanvas(canvas, path.join(folder, filename));
}

// Builds a full carousel: cover + source receipt + inner slides + wealth CTA
// Brief 7: Inner slides (3+) use renderWealthInnerSlide — isolated from @CuttingEdgeOfAI.
// Slide 2 (source receipt) still uses shared renderInnerSlide (type: 'source', different layout).
async function buildWealthNewsCarousel(story, gptData, folder) {
  const innerSlides = Array.isArray(gptData && gptData.slides) ? gptData.slides : [];
  const total = 1 + 1 + innerSlides.length + 1; // cover + source + inner + CTA
  const paths = [];

  // Slide 1: Cover — wealth watermark
  paths.push(await renderCoverSlide(gptData, folder, 1, total, true, WEALTH_WATERMARK));
  console.log('[wealthy] [carousel] Cover slide done');

  // Slide 2: Source receipt card — shared renderer, type: source layout
  const sourceSlide = {
    type:            'source',
    source_name:     gptData.source_name || story.source || 'Source',
    source_headline: gptData.source_headline || story.title || '',
  };
  paths.push(await renderInnerSlide(sourceSlide, 2, total, folder, ''));
  console.log('[wealthy] [carousel] Source slide done');

  // Slides 3+: Wealth narrative slides — isolated renderer, reads `body` field
  for (let i = 0; i < innerSlides.length; i++) {
    paths.push(await renderWealthInnerSlide(innerSlides[i], i + 3, total, folder));
    console.log(`[wealthy] [carousel] Inner slide ${i + 3} done`);
  }

  // Final: Wealth CTA slide
  paths.push(await renderWealthCtaSlide(gptData.cta_keyword || 'BREAKING', folder, total, total));
  console.log('[wealthy] [carousel] CTA slide done');

  console.log(`[wealthy] [carousel] ${total} slides saved to: ${folder}`);
  return paths;
}

// ── OpenAI client ─────────────────────────────────────────────────────────────
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Audience file check ───────────────────────────────────────────────────────
const AUDIENCE_PATH = path.join(__dirname, account.audienceFile);
if (!fs.existsSync(AUDIENCE_PATH)) {
  console.log('[wealthy] WARNING: AUDIENCE_PSYCHOLOGY_WEALTHY.md not found — using SOUL.md fallback. Create this file to improve content quality.');
}

// ── Error log path ────────────────────────────────────────────────────────────
const WEALTHY_ERRORS_LOG = path.join(__dirname, 'memory', 'wealthy-errors.log');

function wealthyLog(message) {
  const ts   = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const line = `[${ts}] ${message}\n`;
  fs.appendFileSync(WEALTHY_ERRORS_LOG, line);
}

function checkLogRotation() {
  try {
    if (!fs.existsSync(WEALTHY_ERRORS_LOG)) return;
    const stat = fs.statSync(WEALTHY_ERRORS_LOG);
    if (stat.size > 100 * 1024) {
      const dateSuffix = new Date().toISOString().slice(0, 10);
      const archivePath = path.join(__dirname, 'memory', `wealthy-errors-archive-${dateSuffix}.log`);
      fs.renameSync(WEALTHY_ERRORS_LOG, archivePath);
      console.log(`[wealthy] Error log rotated → ${archivePath}`);
    }
  } catch (err) {
    console.warn('[wealthy] Log rotation check failed:', err.message);
  }
}

// ── Duplicate prevention (separate file — never touches posted-stories.json) ──
const POSTED_STORIES_PATH = path.join(__dirname, 'memory', 'posted-stories-wealthy.json');

function loadPostedStories() {
  try { return JSON.parse(fs.readFileSync(POSTED_STORIES_PATH, 'utf8')); }
  catch { return []; }
}

function savePostedStories(entries) {
  if (TEST_MODE) return;
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  const trimmed = entries.filter(e => e.timestamp > cutoff);
  try {
    fs.mkdirSync(path.dirname(POSTED_STORIES_PATH), { recursive: true });
    fs.writeFileSync(POSTED_STORIES_PATH, JSON.stringify(trimmed, null, 2));
  } catch (err) {
    console.warn('[wealthy] [dedup] Failed to write posted-stories-wealthy.json:', err.message);
  }
}

function storyKey(headline) {
  return String(headline || '').trim().split(/\s+/).slice(0, 8).join(' ').toLowerCase();
}

function isDuplicateStory(headline) {
  if (TEST_MODE) return false;
  const key    = storyKey(headline);
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return loadPostedStories().some(e => e.timestamp > cutoff && storyKey(e.headline) === key);
}

function markStoryPosted(headline) {
  if (TEST_MODE) return;
  const posted = loadPostedStories();
  posted.push({ headline: String(headline), timestamp: Date.now() });
  savePostedStories(posted);
}

// ── Photo validation helpers (Task 4) ─────────────────────────────────────────
const CRYPTO_KEYWORDS = ['bitcoin', 'ethereum', 'blockchain', 'crypto', 'coin', 'token', 'nft', 'digital currency'];
const SKIP_WORDS      = new Set(['the', 'a', 'an', 'federal', 'national', 'international', 'of', 'for', 'in', 'at', 'by', 'from', 'to', 'and', 'or', 'with', 'global', 'central', 'new']);
const GENERIC_FINANCE = new Set(['reserve', 'rate', 'market', 'fund', 'decision', 'report', 'bank', 'banks', 'finance', 'financial', 'economic', 'economy', 'monetary', 'fiscal', 'index']);

function isTooDark(avgColor) {
  if (!avgColor || typeof avgColor !== 'string') return false;
  const hex = avgColor.replace('#', '');
  if (hex.length < 6) return false;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return r <= 0x11 && g <= 0x11 && b <= 0x11;
}

function simplifySubject(subject) {
  const words = String(subject).toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
  const significant = words.filter(w => !SKIP_WORDS.has(w) && w.length > 2);
  if (significant.length === 0) return 'wealth';
  const first = significant[0];
  if (GENERIC_FINANCE.has(first)) return 'wealth';
  return first;
}

async function fetchPexelsWealth(query) {
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5`,
      { headers: { Authorization: process.env.PEXELS_API_KEY } }
    );
    if (!res.ok) return null;
    const data   = await res.json();
    const photos = data.photos || [];

    for (const photo of photos) {
      const altText     = (photo.alt || '').toLowerCase();
      const cryptoMatch = CRYPTO_KEYWORDS.find(kw => altText.includes(kw));
      if (cryptoMatch) {
        const msg = `${photo.alt} — reason: crypto keyword "${cryptoMatch}"`;
        wealthyLog(`PHOTO REJECTED: ${msg}`);
        console.log(`[wealthy-photo] Pexels rejected (crypto): "${photo.alt}"`);
        continue;
      }
      if (isTooDark(photo.avg_color)) {
        const msg = `${photo.alt} — reason: dark avg_color ${photo.avg_color}`;
        wealthyLog(`PHOTO REJECTED: ${msg}`);
        console.log(`[wealthy-photo] Pexels rejected (dark bg): avg_color=${photo.avg_color}`);
        continue;
      }
      const url = photo.src?.large2x;
      if (url) {
        console.log(`[wealthy-photo] Pexels hit for: "${query}"`);
        return url;
      }
    }
  } catch (err) {
    console.warn(`[wealthy-photo] Pexels failed for "${query}": ${err.message}`);
  }
  return null;
}

// ENHANCED FALLBACK CHAIN: SerpApi → Pexels (full) → Pexels (simplified) → gradient
async function findWealthPhoto(subject, storyTitle) {
  if (!subject) {
    console.log(`[wealthy-photo] No subject — gradient fallback`);
    return null;
  }

  // Step 1: SerpApi Google Images
  const serpKey = process.env.SERPAPI_KEY;
  if (serpKey) {
    try {
      const url = `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(subject)}&api_key=${serpKey}`;
      const res  = await fetch(url);
      if (res.ok) {
        const serpData = await res.json();
        const imgUrl   = serpData.images_results?.[0]?.original;
        if (imgUrl) {
          const urlLower = imgUrl.toLowerCase();
          if (!['logo', 'icon', 'badge', 'avatar'].some(b => urlLower.includes(b))) {
            console.log(`[wealthy-photo] SerpApi hit for: "${subject}"`);
            return imgUrl;
          }
          console.log(`[wealthy-photo] SerpApi rejected (bad URL pattern) for: "${subject}"`);
        }
      }
    } catch (err) {
      console.warn(`[wealthy-photo] SerpApi failed for "${subject}": ${err.message}`);
    }
  }

  // Step 2: Pexels (full subject)
  if (process.env.PEXELS_API_KEY) {
    const fullResult = await fetchPexelsWealth(subject);
    if (fullResult) return fullResult;

    // Step 3: Pexels (simplified subject)
    const simplified = simplifySubject(subject);
    if (simplified !== subject.toLowerCase().trim()) {
      console.log(`[wealthy-photo] Simplified subject retry: "${simplified}"`);
      const simplifiedResult = await fetchPexelsWealth(simplified);
      if (simplifiedResult) return simplifiedResult;
    }

    // Step 3b: "wealth" as last Pexels attempt
    if (simplified !== 'wealth') {
      console.log(`[wealthy-photo] Wealth keyword retry`);
      const wealthResult = await fetchPexelsWealth('wealth');
      if (wealthResult) return wealthResult;
    }
  }

  // Step 4: Gradient fallback
  console.log(`[wealthy-photo] Gradient fallback for: "${subject}"`);
  return null;
}

// ── RSS fetching (wealth feeds) ───────────────────────────────────────────────
async function fetchRssFromFeeds(feedUrls) {
  const parser = new Parser();
  const stories = [];
  const failedUrls = [];

  for (const feedUrl of feedUrls) {
    try {
      const feed  = await parser.parseURL(feedUrl);
      const items = (feed.items || []).slice(0, 10);
      if (items.length === 0) {
        console.log(`[wealthy] Empty feed: ${feedUrl}`);
        failedUrls.push(feedUrl);
        continue;
      }
      for (const item of items) {
        stories.push({
          title:  item.title || '',
          url:    item.link  || '',
          source: feed.title || feedUrl,
        });
      }
    } catch (err) {
      console.log(`[wealthy] Failed feed ${feedUrl}: ${err.message}`);
      failedUrls.push(feedUrl);
    }
  }

  return { stories, failedUrls };
}

// ── Story scoring — wealth mindset criteria (augmented Brief 6) ───────────────
async function scoreWealthStories(stories) {
  const prompt = `You are scoring news stories for a wealth mindset Instagram account targeting aspirational 24-38 year olds who want to think and live like the wealthy.

SCORE 8-10 (publish): Stories about billionaire decisions and strategies, luxury market moves, wealth-building actions by named individuals, investment strategies that separate wealthy investors from average ones, how the wealthy use tax structures or assets differently.

SCORE 4-6 (borderline): General business news with a wealth angle, market moves affecting investors broadly, economic trends with clear wealth implications.

SCORE 1-3 (reject): Geopolitical conflicts, legal scandals at financial institutions, banking fraud cases, regulatory enforcement actions, humanitarian issues, crypto regulatory news, stories about ordinary people or poverty. This audience wants to learn HOW wealthy people think and act — not news about banks doing bad things.

You are a viral social media editor for a wealth and financial independence Instagram page targeting 25-45 year old high earners and aspiring wealthy individuals.

Score each story 1-10 for viral engagement potential.

Score HIGH (8-10) for stories that are:
- Revealing how the wealthy actually behave (what billionaires are buying/selling)
- Threatening to savings, investments, or the middle class
- Surprising contrasts between rich and poor financial behavior
- Record-breaking wealth transfers, deals, or losses
- Conflict between major financial institutions or figures
- Tax strategies or loopholes being closed or exploited
- Hidden fees, wealth transfers, or market manipulation

Score LOW (1-4) for stories that are:
- Dry corporate earnings with no consumer angle
- Minor regulatory updates
- Academic economics papers with no practical angle
- Procedural policy updates
- Geopolitical conflicts or legal scandals with no wealth mindset angle

Score MEDIUM (5-7) for everything else.

Return JSON array with fields:
title, url, score, person (main person or null), source, hook_angle
(hook_angle: one sentence explaining WHY this story is provocative or shareable for a wealth-focused audience)

Stories to score:
${JSON.stringify(stories.map(s => ({ title: s.title, url: s.url, source: s.source })), null, 2)}

Return only a valid JSON array, no other text.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: WEALTH_SYSTEM_PROMPT },
      { role: 'user',   content: prompt },
    ],
    temperature: 0.3,
  });

  const content = response.choices[0].message.content.trim();
  const jsonStr = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(jsonStr);
}

async function fetchWealthTopStories() {
  let { stories } = await fetchRssFromFeeds(account.newsFeeds);

  if (stories.length === 0) {
    console.log('[wealthy] All primary feeds failed — retrying with fallback feeds...');
    const result = await fetchRssFromFeeds(account.newsFeedsFallback);
    stories = result.stories;
    if (stories.length === 0) {
      throw new Error('[wealthy] ERROR: All news feeds failed — skipping slot.');
    }
  }

  // Deduplicate by title
  const seen = new Set();
  const deduped = stories.filter(s => {
    const key = s.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const scored = await scoreWealthStories(deduped.slice(0, 20));

  // Print top 3 for validation
  const topForLog = [...scored].sort((a, b) => b.score - a.score).slice(0, 3);
  console.log('[wealthy-news] Top 3 scored stories:');
  topForLog.forEach((s, i) => console.log(`  ${i + 1}. [${s.score}/10] ${s.title}`));

  // ── Min-score threshold — local variable, NOT a module constant ───────────
  // Base threshold resets to 7 at the start of every run.
  let threshold = 7;
  let qualifying = scored.filter(s => s.score >= threshold);

  if (qualifying.length < 2) {
    threshold = 5;
    qualifying = scored.filter(s => s.score >= threshold);
    console.log('[wealthy-news] Threshold lowered to 5 — insufficient high-score stories this run.');
  }

  if (qualifying.length === 0) {
    wealthyLog('SLOT SKIPPED — no qualifying wealth stories found');
    throw new Error('[wealthy] No qualifying wealth stories found — slot skipped');
  }

  qualifying.sort((a, b) => b.score - a.score);
  const top2 = qualifying.slice(0, 2);

  return Promise.all(top2.map(async (s) => {
    const person = (s.person && s.person !== 'null') ? s.person : null;
    return {
      title:      s.title,
      url:        s.url,
      hook_angle: s.hook_angle || '',
      person,
      photoUrl:   await findWealthPhoto(person || s.title, s.title),
      source:     s.source,
    };
  }));
}

// ── Daily news cache ──────────────────────────────────────────────────────────
let _newsCache = { date: null, stories: null };

async function getWealthNewsStories() {
  const today = new Date().toISOString().slice(0, 10);
  if (_newsCache.date === today && _newsCache.stories) {
    return _newsCache.stories;
  }
  const stories = await fetchWealthTopStories();
  _newsCache = { date: today, stories };
  return stories;
}

// ── Wealth news carousel GPT ──────────────────────────────────────────────────
async function generateWealthNewsCarousel(storyTitle) {
  const prompt = `You are a viral wealth news carousel writer for Instagram. Your output will be rendered as a multi-slide carousel post.

Topic: "${storyTitle}"

HEADLINE FORMULA (cover slide):
- Must name a real person OR company AND include a specific number OR consequence
- Maximum 12 words
- Must create urgency, fear, or disbelief — never neutral
- All caps
- Examples of correct format:
  "WARREN BUFFETT DUMPS $20B IN TREASURIES AS DOLLAR LOSES GROUND"
  "BLACKROCK CEO SAYS CASH IS NO LONGER SAFE — MOVE INTO REAL ASSETS"
  "HEDGE FUNDS QUIETLY BUYING THIS ASSET CLASS BEFORE Q3 REPORT DROPS"
  "THIS BILLIONAIRE SOLD EVERYTHING IN 2024 — NOW WE KNOW WHY"

SUBTITLE LINE (below headline on cover):
- 6-8 words max, smaller text, describes the hook angle
- Example: "The move that changes everything for investors"

INNER SLIDES (slides 2 through N-1):
Each slide is an object with one field:
- "body": A dense narrative paragraph. Start with one bold declarative sentence (the hook or key fact, specific numbers/names). Follow with 2-3 sentences expanding the point. Close with a forward-momentum sentence. Total 4 sentences. No exclamation marks.

Rules:
- Lead with the most alarming or surprising fact first
- Include specific numbers, names, dollar amounts wherever possible
- First inner slide body should open with the key fact that proves the headline
- Last inner slide body should close with a "why this matters" or forward-looking statement
- Provide 4 to 6 inner slides

CAPTION:
- 4-5 short paragraphs, punchy
- Start immediately with the news — no fluff opener
- End with: "Follow @edgeofthewealthy for everything the wealthy don't want you to know."
- Cite the source on the last line: "Source: [Publication]"
- Wealth hashtags only: #WealthMindset #FinancialFreedom #InvestingTips #WealthBuilding #MoneyMoves

NAMED PERSON for photo sourcing:
- Output "photo_subject" with the full name of the primary person in the story
- If no named person, output the company name

SOURCE INFO:
- "source_name": the outlet name (e.g. "Bloomberg", "Forbes", "Business Insider")
- "source_headline": the actual article or post title, max 15 words

Return ONLY valid JSON. No markdown, no code fences, no commentary:

{
  "headline": "ALL CAPS HEADLINE MAX 12 WORDS",
  "subtitle": "6-8 word subtitle describing hook angle",
  "photo_subject": "Full Name or Company",
  "source_name": "Bloomberg",
  "source_headline": "Original article title, max 15 words",
  "slides": [
    { "body": "Bold opening sentence with key fact and specific numbers. Follow-on sentence expanding the point. Second follow-on sentence with context or consequence. Closing sentence with forward momentum." },
    { "body": "Bold opening sentence with background context. Follow-on sentence with who is affected. Second follow-on sentence with scale or implication. Closing sentence linking to the bigger picture." },
    { "body": "Bold opening sentence on impact. Follow-on sentence quantifying the effect. Second follow-on sentence with a contrasting perspective or comparison. Closing sentence building toward the CTA." },
    { "body": "Bold opening forward-looking sentence. Follow-on sentence explaining why this matters now. Second follow-on sentence on what changes next. Closing sentence with a sense of urgency or opportunity." }
  ],
  "caption": "Full Instagram caption with paragraphs separated by newlines.",
  "cta_keyword": "BREAKING"
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: WEALTH_SYSTEM_PROMPT },
      { role: 'user',   content: prompt },
    ],
    temperature: 0.85,
  });

  const raw     = response.choices[0].message.content.trim();
  const jsonStr = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(jsonStr);
}

// ── Wealth resource carousel GPT ──────────────────────────────────────────────
async function generateWealthResourceCarousel() {
  const prompt = `Generate 5 wealth-building principles used by billionaires and top 1% earners. Each must name a specific strategy, person, or concept. No generic advice. Think: tax strategies, asset classes, mindset frameworks, leverage tactics. Max 12 words each. Aspirational and exclusive tone.

Return a JSON array of exactly 5 strings, no other text.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: WEALTH_SYSTEM_PROMPT },
      { role: 'user',   content: prompt },
    ],
    temperature: 0.7,
  });

  const raw     = response.choices[0].message.content.trim();
  const jsonStr = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  const slides  = JSON.parse(jsonStr);

  const content = {
    post_type:   'copy-paste-prompts',
    hook_text:   '5 STRATEGIES THE 1% USE TO BUILD WEALTH',
    slides,
    caption_cta: "Comment PROMPTS and I'll DM you the full wealth playbook \uD83D\uDC47",
  };

  const folder = getOutputFolder('resource', content.hook_text);
  // Pass WEALTH_WATERMARK — overrides "CUTTING EDGE OF AI" on cover slide
  const paths  = await renderResourceCarousel(content, folder, WEALTH_WATERMARK);
  console.log('[wealthy] Saved resource carousel files:');
  paths.forEach(p => console.log(`  - ${p}`));
  return { ...content, paths };
}

// ── Caption post-processing ───────────────────────────────────────────────────
function fixCaptionHandle(caption) {
  if (typeof caption !== 'string') return caption;
  return caption
    .replace(/@cuttingedgeofai/gi,         '@edgeofthewealthy')
    .replace(/CuttingEdgeOfAI/gi,          'EdgeOfTheWealthy')
    .replace(/#AINews\b/g,                 '#WealthNews')
    .replace(/#ArtificialIntelligence\b/g, '#FinancialFreedom')
    .replace(/#AITools\b/g,                '#WealthMindset')
    .replace(/#FutureOfAI\b/g,             '#WealthBuilding')
    .replace(/#AIBreaking\b/g,             '#MoneyMoves')
    .replace(/#AIProductivity\b/g,         '#InvestingTips');
}

// ── Run slot ──────────────────────────────────────────────────────────────────
async function runSlot(format) {
  checkLogRotation();

  const igId         = account.igAccountId;
  const token        = account.igToken;
  const retryOptions = { page: 'wealthyedge', slot: format };

  console.log(`[wealthy] Running slot — format: ${format}`);
  console.log(`[wealthy] GPT context: ${WEALTH_SYSTEM_PROMPT}`);

  try {
    // ── Viral demo ──────────────────────────────────────────────────────────
    if (format === 'viral_demo') {
      console.log('[wealthy] Generating viral demo post...');
      const demo = await generateViralDemoPost('wealth');

      if (!demo) {
        console.log('[wealthy] [viral-demo] no qualifying post found — slot skipped');
        return;
      }

      const imageUrl = await upload(demo.imagePath, 'shadow-pages-wealthy', retryOptions);
      const caption  = fixCaptionHandle(demo.caption);
      const result   = await postImage({ igId, token, imageUrl, caption }, retryOptions);
      console.log('[wealthy] Viral demo posted:', demo.headline);
      if (result && result.id) console.log('[wealthy] Post ID:', result.id);

    // ── News carousel ───────────────────────────────────────────────────────
    } else if (format === 'news-carousel-morning' || format === 'news-carousel-evening') {
      let stories;
      try {
        stories = await getWealthNewsStories();
      } catch (err) {
        console.error(`[wealthy] ${err.message}`);
        logError({ page: 'wealthyedge', slot: format, error: err });
        return;
      }

      const preferredIndex = format === 'news-carousel-morning' ? 0 : 1;
      let story = null;
      for (let si = preferredIndex; si < stories.length; si++) {
        if (!isDuplicateStory(stories[si].title)) { story = stories[si]; break; }
        console.log(`[wealthy] Skipping duplicate story: ${stories[si].title}`);
      }
      if (!story) {
        console.log('[wealthy] No non-duplicate story available — slot skipped');
        return;
      }
      console.log('[wealthy] News carousel:', story.title);

      // Generate wealth-specific carousel content
      let gptData = null;
      try {
        gptData = await generateWealthNewsCarousel(story.title);
      } catch (err) {
        console.warn('[wealthy] Failed to generate carousel GPT data:', err.message);
      }

      const newsFolder = getOutputFolder('news', story.title);

      // Brief 7: Single-image hook post removed — was firing a duplicate post for the same story.
      // The carousel below is the only post for this slot. renderNewsHookImage is preserved in
      // image-renderer.js and can be re-enabled here if a hook post is needed in future.

      // Carousel — wealth builder (custom watermark + CTA + source label)
      let carouselPaths;
      try {
        if (!gptData) throw new Error('No gptData available');
        carouselPaths = await buildWealthNewsCarousel(story, gptData, newsFolder);
      } catch (err) {
        console.warn('[wealthy] carousel build failed, falling back to legacy:', err.message);
        carouselPaths = await renderNewsCarouselLegacy(
          { ...story, slides: Array.isArray(gptData && gptData.slides) ? gptData.slides : [] },
          gptData,
          newsFolder
        );
      }

      const imageUrls = [];
      for (const p of carouselPaths) {
        imageUrls.push(await upload(p, 'shadow-pages-wealthy', retryOptions));
      }

      const caption = gptData && gptData.caption
        ? fixCaptionHandle(gptData.caption)
        : fixCaptionHandle(await generateCaption('wealth', story.title, retryOptions));

      const carouselResult = await postCarousel({ igId, token, imageUrls, caption }, retryOptions);
      if (story.title) markStoryPosted(story.title);
      console.log('[wealthy] News carousel posted');
      if (carouselResult && carouselResult.id) console.log('[wealthy] Carousel post ID:', carouselResult.id);

    // ── Resource carousel ───────────────────────────────────────────────────
    } else if (format === 'resource-carousel') {
      console.log('[wealthy] Building wealth resource carousel...');
      const resource   = await generateWealthResourceCarousel();
      const slidePaths = resource.paths || [];

      const imageUrls = [];
      for (const p of slidePaths) {
        imageUrls.push(await upload(p, 'shadow-pages-wealthy', retryOptions));
      }

      const rawCaption = await generateCaption(
        'wealth',
        resource.hook_text || '',
        { ...retryOptions, caption_cta: resource.caption_cta }
      );
      const caption        = fixCaptionHandle(rawCaption);
      const carouselResult = await postCarousel({ igId, token, imageUrls, caption }, retryOptions);
      console.log('[wealthy] Resource carousel posted');
      if (carouselResult && carouselResult.id) console.log('[wealthy] Resource post ID:', carouselResult.id);
    }

  } catch (err) {
    if (err instanceof TokenLimitExceededError) {
      console.warn('[wealthy] Skipping slot: Daily token limit reached');
      logError({ page: 'wealthyedge', slot: format, error: err });
      return;
    }
    logError({ page: 'wealthyedge', slot: format, error: err });
    throw err;
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────
if (TEST_MODE) {
  runSlot('news-carousel-morning')
    .then(() => {
      console.log('[wealthy-test] Test complete — exiting');
      process.exit(0);
    })
    .catch(err => {
      console.error('[wealthy-test] Error:', err.message);
      process.exit(1);
    });
} else {
  console.log('[wealthy] Scheduler starting...');
  cron.schedule('0 8 * * *',  async () => {
    try { await runSlot('viral_demo'); }
    catch (err) { console.error('[wealthy] Error in viral_demo slot:', err.message); }
  });
  cron.schedule('0 13 * * *', async () => {
    try { await runSlot('news-carousel-morning'); }
    catch (err) { console.error('[wealthy] Error in news-carousel-morning slot:', err.message); }
  });
  cron.schedule('0 17 * * *', async () => {
    try { await runSlot('resource-carousel'); }
    catch (err) { console.error('[wealthy] Error in resource-carousel slot:', err.message); }
  });
  cron.schedule('0 20 * * *', async () => {
    try { await runSlot('news-carousel-evening'); }
    catch (err) { console.error('[wealthy] Error in news-carousel-evening slot:', err.message); }
  });
  console.log('[wealthy] Scheduled: 8am viral demo | 1pm news | 5pm resources | 8pm news');
  console.log('[wealthy] Scheduler running. Press Ctrl+C to stop.');
}
