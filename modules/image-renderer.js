require('dotenv').config();
const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');

// ─── Font registration ────────────────────────────────────────────────────────
const FONT_PATHS = [
  { path: 'C:/Windows/Fonts/ariblk.ttf', family: 'Arial Black' },
  { path: 'C:/Windows/Fonts/impact.ttf',  family: 'Impact' },
];
for (const f of FONT_PATHS) {
  try { if (fs.existsSync(f.path)) registerFont(f.path, { family: f.family }); }
  catch (_) {}
}

// ─── Constants ────────────────────────────────────────────────────────────────
const W           = 1080;
const H           = 1080;
const H_HOOK      = 1350;    // 4:5 portrait for hook image
const GOLD        = '#E8C547';
const DARK        = '#0d0d0d';
const CREAM       = '#F5F0E8';
const NEAR_BLACK  = '#0a0a0a';
const CHARCOAL    = '#1a1a1a';
const OUTPUT_BASE = 'C:/Users/colle/shadow-pages/output';
const ASSETS_DIR  = path.join(__dirname, '..', 'assets');
const BRAND_LOGO_PATH = path.join(ASSETS_DIR, 'brand-logo.png');

// ─── Output folder helper ─────────────────────────────────────────────────────

function getOutputFolder(type, topic) {
  const now = new Date();
  const dateStr = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
  const timeStr = [
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
  ].join('-');

  const slug = (topic || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join('-');

  const baseName = `${dateStr}_${timeStr}_${type}${slug ? '_' + slug : ''}`;
  let folderPath = path.join(OUTPUT_BASE, baseName);
  let counter = 1;
  while (fs.existsSync(folderPath)) {
    counter++;
    folderPath = path.join(OUTPUT_BASE, `${baseName}_${counter}`);
  }
  fs.mkdirSync(folderPath, { recursive: true });
  return folderPath;
}

// ─── Canvas helpers ───────────────────────────────────────────────────────────

function saveCanvas(canvas, outPath) {
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const buf = canvas.toBuffer('image/jpeg', { quality: 0.92 });
  fs.writeFileSync(outPath, buf);
  return outPath;
}

function wrapLines(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? current + ' ' + word : word;
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

function drawTextBlock(ctx, lines, cx, cy, lineHeight, { maxLines } = {}) {
  const useLines = maxLines ? lines.slice(0, maxLines) : lines;
  const totalH   = (useLines.length - 1) * lineHeight;
  const startY   = cy - totalH / 2;
  for (let i = 0; i < useLines.length; i++) {
    ctx.fillText(useLines[i], cx, startY + i * lineHeight);
  }
  return totalH;
}

function drawImageCover(ctx, img, x, y, w, h) {
  const srcAR = img.width / img.height;
  const dstAR = w / h;
  let sx, sy, sw, sh;
  if (srcAR > dstAR) {
    sh = img.height;
    sw = sh * dstAR;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = sw / dstAR;
    sx = 0;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function drawGradientFill(ctx, x, y, w, h) {
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, '#0d0d0d');
  grad.addColorStop(1, '#1a1a2e');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
}

// ─── Brand logo ───────────────────────────────────────────────────────────────

async function fetchAndSaveBrandLogo() {
  if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });
  const fetch = (await import('node-fetch')).default;

  const igId    = process.env.IG_ACCOUNT_ID_CUTTINGEDGE;
  const igToken = process.env.IG_TOKEN_CUTTINGEDGE;

  if (igId && igToken) {
    try {
      const apiUrl = `https://graph.facebook.com/v19.0/${igId}?fields=profile_picture_url&access_token=${igToken}`;
      const res = await fetch(apiUrl);
      if (res.ok) {
        const data = await res.json();
        const picUrl = data.profile_picture_url;
        if (picUrl) {
          const imgRes = await fetch(picUrl);
          if (imgRes.ok) {
            fs.writeFileSync(BRAND_LOGO_PATH, Buffer.from(await imgRes.arrayBuffer()));
            console.log('[brand-logo] Profile picture saved to assets/brand-logo.png');
            return;
          }
        }
      } else {
        const errBody = await res.text().catch(() => '');
        console.log(`[brand-logo] Failed to fetch profile picture: HTTP ${res.status} ${errBody.slice(0, 200)}`);
      }
    } catch (err) {
      console.log(`[brand-logo] Failed to fetch profile picture: ${err.message}`);
    }
  }

  // Placeholder fallback
  try {
    const imgRes = await fetch('https://via.placeholder.com/150/0d0d0d/E8C547?text=CEofAI');
    if (imgRes.ok) {
      fs.writeFileSync(BRAND_LOGO_PATH, Buffer.from(await imgRes.arrayBuffer()));
      console.log('[brand-logo] Placeholder saved to assets/brand-logo.png');
    }
  } catch (err) {
    console.log(`[brand-logo] Failed to fetch placeholder: ${err.message}`);
  }
}

let _brandLogoImage  = null;
let _brandLogoLoaded = false;

async function loadBrandLogoImage() {
  if (_brandLogoLoaded) return _brandLogoImage;
  _brandLogoLoaded = true;
  if (!fs.existsSync(BRAND_LOGO_PATH)) await fetchAndSaveBrandLogo();
  try { _brandLogoImage = await loadImage(BRAND_LOGO_PATH); }
  catch (_) { _brandLogoImage = null; }
  return _brandLogoImage;
}

function drawBrandLogo(ctx, logoImg) {
  if (logoImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(20 + 24, 20 + 24, 24, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logoImg, 20, 20, 48, 48);
    ctx.restore();
  } else {
    ctx.font = '18px Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('@cuttingedgeofai', 20, 20);
  }
}

// ─── 4-step photo fallback chain ──────────────────────────────────────────────

async function fetchPhotoWithFallback(query, orientation = 'landscape') {
  const fetch = (await import('node-fetch')).default;

  // Step 1 — Pexels
  if (process.env.PEXELS_API_KEY) {
    try {
      const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=${orientation}`;
      const res = await fetch(url, { headers: { Authorization: process.env.PEXELS_API_KEY } });
      if (res.ok) {
        const data = await res.json();
        const photoUrl = data.photos?.[0]?.src?.large2x;
        if (photoUrl) {
          const imgRes = await fetch(photoUrl);
          if (imgRes.ok) {
            console.log(`[image-renderer] Photo source: pexels — "${query}"`);
            return await loadImage(Buffer.from(await imgRes.arrayBuffer()));
          }
        }
      }
    } catch (_) {}
  }

  // Step 2 — Unsplash
  if (process.env.UNSPLASH_ACCESS_KEY) {
    try {
      const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&client_id=${process.env.UNSPLASH_ACCESS_KEY}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const imgUrl = data.results?.[0]?.urls?.regular;
        if (imgUrl) {
          const imgRes = await fetch(imgUrl);
          if (imgRes.ok) {
            console.log(`[image-renderer] Photo source: unsplash — "${query}"`);
            return await loadImage(Buffer.from(await imgRes.arrayBuffer()));
          }
        }
      }
    } catch (_) {}
  }

  // Step 3 — Bing Image Search
  if (process.env.BING_SEARCH_API_KEY) {
    try {
      const url = `https://api.bing.microsoft.com/v7.0/images/search?q=${encodeURIComponent(query)}&count=1&imageType=Photo`;
      const res = await fetch(url, { headers: { 'Ocp-Apim-Subscription-Key': process.env.BING_SEARCH_API_KEY } });
      if (res.ok) {
        const data = await res.json();
        const imgUrl = data.value?.[0]?.contentUrl;
        if (imgUrl) {
          const imgRes = await fetch(imgUrl);
          if (imgRes.ok) {
            console.log(`[image-renderer] Photo source: bing — "${query}"`);
            return await loadImage(Buffer.from(await imgRes.arrayBuffer()));
          }
        }
      }
    } catch (_) {}
  }

  // Step 4 — DALL-E 3 (contextual scene, not a face)
  if (process.env.OPENAI_API_KEY) {
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await openai.images.generate({
        model:  'dall-e-3',
        prompt: `Cinematic editorial scene representing ${query}, dramatic lighting, dark moody atmosphere, no people, high resolution`,
        n:      1,
        size:   '1024x1024',
      });
      const imgUrl = response.data?.[0]?.url;
      if (imgUrl) {
        const imgRes = await fetch(imgUrl);
        if (imgRes.ok) {
          console.log(`[image-renderer] Photo source: dall-e-3 — "${query}"`);
          return await loadImage(Buffer.from(await imgRes.arrayBuffer()));
        }
      }
    } catch (_) {}
  }

  // Step 5 — all sources failed, use gradient
  console.log(`[image-renderer] Photo source: gradient (all failed) — "${query}"`);
  return null;
}

async function loadImageSafe(src) {
  if (!src) return null;
  try { return await loadImage(src); }
  catch (_) { return null; }
}

// ─── POST TYPE 1 — QUOTE ─────────────────────────────────────────────────────

async function renderQuoteSlide(text, outputFolder = null) {
  const clean = text.replace(/!/g, '').trim();
  const len   = clean.length;
  let fontSize = len < 40 ? 88 : len <= 80 ? 68 : 52;

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');
  const fontStack = '"Arial Black", Impact, Arial, sans-serif';

  ctx.fillStyle = NEAR_BLACK;
  ctx.fillRect(0, 0, W, H);

  const rule1Y = Math.round(H * 0.35);
  const rule2Y = Math.round(H * 0.65);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth   = 1;
  ctx.beginPath(); ctx.moveTo(0, rule1Y); ctx.lineTo(W, rule1Y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, rule2Y); ctx.lineTo(W, rule2Y); ctx.stroke();

  const maxWidth = W * 0.80;
  const zoneH    = rule2Y - rule1Y;
  let lines;
  while (true) {
    ctx.font = `bold ${fontSize}px ${fontStack}`;
    lines = wrapLines(ctx, clean, maxWidth);
    const blockH = lines.length * fontSize * 1.3;
    if (blockH <= zoneH - 20 || fontSize <= 24) break;
    fontSize -= 8;
  }

  const lineHeight  = fontSize * 1.3;
  const zoneCenter  = rule1Y + zoneH / 2;
  ctx.fillStyle     = '#FFFFFF';
  ctx.textAlign     = 'center';
  ctx.textBaseline  = 'middle';
  ctx.font          = `bold ${fontSize}px ${fontStack}`;
  drawTextBlock(ctx, lines, W / 2, zoneCenter, lineHeight);

  // Brand logo watermark
  const logoImg = await loadBrandLogoImage();
  drawBrandLogo(ctx, logoImg);

  const folder = outputFolder || getOutputFolder('quote', clean);
  return saveCanvas(canvas, path.join(folder, 'quote.jpg'));
}

// ─── POST TYPE 2 — NEWS CAROUSEL ─────────────────────────────────────────────

async function renderNewsCarousel(story, outputFolder = null) {
  const fontStack = '"Arial Black", Impact, Arial, sans-serif';
  const folder    = outputFolder || getOutputFolder('news', story.title);
  const paths     = [];
  const logoImg   = await loadBrandLogoImage();

  // ── Slide 1: Hook ────────────────────────────────────────────────────────
  {
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');

    const leftW  = Math.round(W * 0.42);
    const rightW = W - leftW;
    const rightX = leftW;

    // Left column: person photo with fallback chain
    let personImg = await loadImageSafe(story.photoUrl);
    if (personImg) {
      console.log(`[image-renderer] Hook (slide 1): loaded photo from story.photoUrl`);
    } else {
      const q = story.person || story.title || 'AI news';
      personImg = await fetchPhotoWithFallback(q, 'portrait');
    }

    if (personImg) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, leftW, H);
      ctx.clip();
      drawImageCover(ctx, personImg, 0, 0, leftW, H);
      ctx.restore();
    } else {
      drawGradientFill(ctx, 0, 0, leftW, H);
    }

    // Right column
    ctx.fillStyle = DARK;
    ctx.fillRect(rightX, 0, rightW, H);
    ctx.fillStyle = GOLD;
    ctx.fillRect(rightX, 0, 4, H);

    const innerCX = rightX + 4 + rightW / 2 - 2;
    const innerW  = rightW - 4 - 56;

    ctx.font        = '18px Arial, sans-serif';
    ctx.fillStyle   = GOLD;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'top';
    ctx.letterSpacing = '3px';
    ctx.fillText((story.source || 'AI NEWS').toUpperCase(), innerCX, H * 0.15);
    ctx.letterSpacing = '0px';

    const headline = story.title.toUpperCase();
    let hFontSize = 48;
    let hLines;
    while (true) {
      ctx.font = `bold ${hFontSize}px ${fontStack}`;
      hLines   = wrapLines(ctx, headline, innerW);
      if (hLines.length * hFontSize * 1.2 <= H * 0.45 || hFontSize <= 24) break;
      hFontSize -= 4;
    }
    ctx.fillStyle    = '#FFFFFF';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font         = `bold ${hFontSize}px ${fontStack}`;
    drawTextBlock(ctx, hLines, innerCX, H * 0.50, hFontSize * 1.2);

    const ruleY = H * 0.74;
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth   = 1;
    const ruleW     = innerW * 0.6;
    ctx.beginPath();
    ctx.moveTo(innerCX - ruleW / 2, ruleY);
    ctx.lineTo(innerCX + ruleW / 2, ruleY);
    ctx.stroke();

    ctx.font         = '16px Arial, sans-serif';
    ctx.fillStyle    = 'rgba(255,255,255,0.5)';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('SWIPE TO LEARN MORE →', innerCX, ruleY + 14);

    // Brand logo
    drawBrandLogo(ctx, logoImg);

    paths.push(saveCanvas(canvas, path.join(folder, 'slide_01.jpg')));
  }

  // ── Slides 2–6: Content slides ───────────────────────────────────────────
  for (let i = 0; i < 5; i++) {
    const canvas   = createCanvas(W, H);
    const ctx      = canvas.getContext('2d');
    const slideNum = i + 2;
    const bodyText = (story.slides || [])[i] || '';

    // Full canvas background — no zones, no bands
    ctx.fillStyle = DARK;
    ctx.fillRect(0, 0, W, H);

    // Gold 4px bar at very top, full width
    ctx.fillStyle = GOLD;
    ctx.fillRect(0, 0, W, 4);

    // Slide counter top-right: Arial Black, 28px, GOLD
    const numLabel = `${String(slideNum).padStart(2, '0')} / 07`;
    ctx.font         = `bold 28px ${fontStack}`;
    ctx.fillStyle    = GOLD;
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(numLabel, W - 36, 20);

    // Punchy fact text: dynamic font size, centered vertically and horizontally
    const len = bodyText.length;
    let bFontSize = len < 60 ? 72 : len <= 100 ? 56 : 44;
    const maxWidth = W * 0.80;
    let bLines;
    while (true) {
      ctx.font = `bold ${bFontSize}px ${fontStack}`;
      bLines   = wrapLines(ctx, bodyText, maxWidth);
      if (bLines.length * bFontSize * 1.35 <= H * 0.75 || bFontSize <= 24) break;
      bFontSize -= 4;
    }
    ctx.fillStyle    = '#FFFFFF';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font         = `bold ${bFontSize}px ${fontStack}`;
    drawTextBlock(ctx, bLines, W / 2, H / 2, bFontSize * 1.35);

    // Source credit bottom-left: Arial, 22px, #888888
    ctx.font         = '22px Arial, sans-serif';
    ctx.fillStyle    = '#888888';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`Source: ${story.source || 'AI News'}`, 36, H - 28);

    drawBrandLogo(ctx, logoImg);

    paths.push(saveCanvas(canvas, path.join(folder, `slide_0${slideNum}.jpg`)));
  }

  // ── Slide 7: CTA ─────────────────────────────────────────────────────────
  {
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');

    ctx.fillStyle = GOLD;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let gy = 40; gy < H; gy += 40) {
      for (let gx = 40; gx < W; gx += 40) {
        ctx.beginPath();
        ctx.arc(gx, gy, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.fillStyle    = DARK;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font         = `bold 42px ${fontStack}`;
    ctx.fillText('FOLLOW FOR DAILY', W / 2, H / 2 - 80);

    ctx.font = `bold 52px ${fontStack}`;
    ctx.fillText('@CUTTINGEDGEOFAI', W / 2, H / 2 + 10);

    ctx.font      = '24px Arial, sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText('NEW AI NEWS EVERY DAY', W / 2, H / 2 + 88);

    paths.push(saveCanvas(canvas, path.join(folder, 'slide_07.jpg')));
  }

  return paths;
}

// ─── POST TYPE 4 — NEWS HOOK IMAGE ───────────────────────────────────────────

async function renderNewsHookImage(story, outputFolder = null) {
  const HW        = W;       // 1080
  const HH        = 1350;    // 4:5 portrait
  const topH      = Math.round(HH * 0.60);   // 810px
  const bottomH   = HH - topH;               // 540px
  const fontStack = '"Arial Black", Impact, Arial, sans-serif';
  const folder    = outputFolder || getOutputFolder('news', story.title);
  const logoImg   = await loadBrandLogoImage();

  const canvas = createCanvas(HW, HH);
  const ctx    = canvas.getContext('2d');

  // ── TOP ZONE: full bleed photo ───────────────────────────────────────────
  let topImg = await loadImageSafe(story.photoUrl);
  if (topImg) {
    console.log(`[image-renderer] Hook image: loaded photo from story.photoUrl`);
  } else {
    const q = story.person || story.title || 'AI news';
    topImg = await fetchPhotoWithFallback(q, 'portrait');
  }

  if (topImg) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, HW, topH);
    ctx.clip();
    drawImageCover(ctx, topImg, 0, 0, HW, topH);
    ctx.restore();
  } else {
    drawGradientFill(ctx, 0, 0, HW, topH);
  }

  // Brand logo top-left
  drawBrandLogo(ctx, logoImg);

  // ── DIVIDER ──────────────────────────────────────────────────────────────
  const dividerY = topH;
  ctx.strokeStyle = GOLD;
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(0, dividerY);
  ctx.lineTo(HW, dividerY);
  ctx.stroke();

  // Floating pill centered on divider
  const pillText   = 'CUTTINGEDGEOFAI';
  ctx.font         = '13px Arial, sans-serif';
  const pillMetrics = ctx.measureText(pillText);
  const pillPadX   = 20;
  const pillPadY   = 8;
  const pillW      = pillMetrics.width + pillPadX * 2;
  const pillH      = 13 + pillPadY * 2;
  const pillX      = (HW - pillW) / 2;
  const pillY      = dividerY - pillH / 2;

  ctx.fillStyle = DARK;
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, pillH, 20);
  ctx.fill();

  ctx.fillStyle    = GOLD;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '3px';
  ctx.fillText(pillText, HW / 2, dividerY);
  ctx.letterSpacing = '0px';

  // ── BOTTOM ZONE ──────────────────────────────────────────────────────────
  ctx.fillStyle = DARK;
  ctx.fillRect(0, topH, HW, bottomH);

  const bottomPad = 30;

  // Source label
  const sourceLabel = (story.source || 'AI NEWS').toUpperCase();
  ctx.font          = '16px Arial, sans-serif';
  ctx.fillStyle     = GOLD;
  ctx.textAlign     = 'center';
  ctx.textBaseline  = 'top';
  ctx.letterSpacing = '3px';
  ctx.fillText(sourceLabel, HW / 2, topH + bottomPad);
  ctx.letterSpacing = '0px';

  // Headline
  const headline  = story.title.toUpperCase();
  const headLen   = headline.length;
  const headSize  = headLen < 60 ? 72 : headLen <= 100 ? 56 : 44;
  const maxWidth  = HW * 0.90;
  const headLineH = headSize * 1.15;

  ctx.font         = `bold ${headSize}px ${fontStack}`;
  const hLines     = wrapLines(ctx, headline, maxWidth);
  ctx.fillStyle    = '#FFFFFF';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  // Vertically center headline in remaining space below source label
  const sourceLabelH  = 16 + 10;
  const headZoneTop   = topH + bottomPad + sourceLabelH + 20;
  const headZoneBot   = HH - bottomPad;
  const headZoneH     = headZoneBot - headZoneTop;
  const headZoneCenter = headZoneTop + headZoneH / 2;

  drawTextBlock(ctx, hLines, HW / 2, headZoneCenter, headLineH);

  return saveCanvas(canvas, path.join(folder, 'hook.jpg'));
}

// ─── POST TYPE 3 — RESOURCE CAROUSEL ─────────────────────────────────────────

const RESOURCE_PHOTO_QUERIES = {
  'copy-paste-prompts': 'AI prompts productivity technology workspace dark',
  'tool-spotlight':     'AI tools technology innovation workspace dark',
  'how-to-guide':       'workflow productivity technology morning dark',
  'stat-carousel':      'data statistics technology screen dark',
};

async function renderResourceCarousel(resource, outputFolder = null) {
  // Normalise: accept old array format or new object format
  let post_type, hook_text, slides, caption_cta;
  if (Array.isArray(resource)) {
    post_type   = 'copy-paste-prompts';
    hook_text   = resource[0]?.text || '5 AI PROMPTS WORTH SAVING';
    slides      = resource.slice(1, 6).map(s => (typeof s === 'string' ? s : (s.text || '')));
    caption_cta = null;
  } else {
    post_type   = resource.post_type   || 'copy-paste-prompts';
    hook_text   = resource.hook_text   || '5 AI PROMPTS WORTH SAVING';
    slides      = resource.slides      || [];
    caption_cta = resource.caption_cta || null;
  }

  const fontStack = '"Arial Black", Impact, Arial, sans-serif';
  const folder    = outputFolder || getOutputFolder('resource', hook_text);
  const paths     = [];
  const logoImg   = await loadBrandLogoImage();
  const photoQuery = RESOURCE_PHOTO_QUERIES[post_type] || 'AI technology workspace dark';

  // ── Slide 1: Hook ────────────────────────────────────────────────────────
  {
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');

    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 0, W, H);

    const bgImg = await fetchPhotoWithFallback(photoQuery, 'landscape');
    if (bgImg) drawImageCover(ctx, bgImg, 0, 0, W, H);
    else drawGradientFill(ctx, 0, 0, W, H);

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(0,0,0,0.1)');
    grad.addColorStop(1, 'rgba(0,0,0,0.80)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    const bottomZoneTop = H * 0.60;
    const maxWidth      = W * 0.85;

    ctx.font         = '20px Arial, sans-serif';
    ctx.fillStyle    = GOLD;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(post_type.replace(/-/g, ' ').toUpperCase(), W / 2, bottomZoneTop);

    const hookUpper = hook_text.toUpperCase();
    let hFontSize   = 54;
    let hLines;
    while (true) {
      ctx.font = `bold ${hFontSize}px ${fontStack}`;
      hLines   = wrapLines(ctx, hookUpper, maxWidth);
      if (hLines.length * hFontSize * 1.2 <= H * 0.25 || hFontSize <= 24) break;
      hFontSize -= 4;
    }
    ctx.fillStyle    = '#FFFFFF';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.font         = `bold ${hFontSize}px ${fontStack}`;
    let lineY = bottomZoneTop + 36;
    for (const line of hLines) {
      ctx.fillText(line, W / 2, lineY);
      lineY += hFontSize * 1.2;
    }

    ctx.font         = 'italic 20px Arial, sans-serif';
    ctx.fillStyle    = 'rgba(255,255,255,0.7)';
    ctx.textBaseline = 'top';
    ctx.fillText('Swipe to steal them →', W / 2, lineY + 10);

    drawBrandLogo(ctx, logoImg);
    paths.push(saveCanvas(canvas, path.join(folder, 'slide_01.jpg')));
  }

  // ── Slides 2–6: Content slides ───────────────────────────────────────────
  for (let i = 0; i < 5; i++) {
    const slideData  = slides[i];
    const canvas     = createCanvas(W, H);
    const ctx        = canvas.getContext('2d');
    const slideNum   = i + 1;

    if (post_type === 'stat-carousel') {
      // Dark design: gold top bar, stat text, source below
      ctx.fillStyle = DARK;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = GOLD;
      ctx.fillRect(0, 0, W, 4);

      const numLabel = `${String(i + 2).padStart(2, '0')} / 07`;
      ctx.font         = '16px Arial, sans-serif';
      ctx.fillStyle    = 'rgba(255,255,255,0.3)';
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(numLabel, W - 36, 24);

      const stat   = typeof slideData === 'object' ? (slideData.stat   || '') : String(slideData || '');
      const source = typeof slideData === 'object' ? (slideData.source || '') : '';

      const maxWidth = W * 0.80;
      let sFontSize  = 52;
      let sLines;
      while (true) {
        ctx.font = `bold ${sFontSize}px ${fontStack}`;
        sLines   = wrapLines(ctx, stat, maxWidth);
        if (sLines.length * sFontSize * 1.35 <= H * 0.55 || sFontSize <= 24) break;
        sFontSize -= 4;
      }
      ctx.fillStyle    = '#FFFFFF';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.font         = `bold ${sFontSize}px ${fontStack}`;
      drawTextBlock(ctx, sLines, W / 2, H * 0.46, sFontSize * 1.35);

      if (source) {
        ctx.font         = '14px Arial, sans-serif';
        ctx.fillStyle    = 'rgba(255,255,255,0.4)';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`— ${source}`, W / 2, H * 0.72);
      }

    } else {
      // Cream/dark 2-zone design
      const topZoneH    = Math.round(H * 0.25);
      const bottomZoneH = H - topZoneH;

      ctx.fillStyle = CHARCOAL;
      ctx.fillRect(0, 0, W, topZoneH);

      // Label (top zone)
      const labelPrefix = post_type === 'how-to-guide'   ? 'STEP'   :
                          post_type === 'tool-spotlight' ? 'TOOL'   : 'PROMPT';
      ctx.font         = 'bold 22px Arial, sans-serif';
      ctx.fillStyle    = GOLD;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${labelPrefix} ${String(slideNum).padStart(2, '0')}`, W / 2, topZoneH * 0.45);

      // Tool name in top zone (tool-spotlight only)
      if (post_type === 'tool-spotlight' && typeof slideData === 'object' && slideData.tool_name) {
        ctx.font      = '18px Arial, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText(slideData.tool_name.toUpperCase(), W / 2, topZoneH * 0.75);
      }

      ctx.fillStyle = CREAM;
      ctx.fillRect(0, topZoneH, W, bottomZoneH);

      const maxWidth = W * 0.80;
      const blockCY  = topZoneH + bottomZoneH / 2;
      const blockX   = (W - maxWidth) / 2;

      // Main text
      let mainText;
      if (post_type === 'tool-spotlight' && typeof slideData === 'object') {
        mainText = slideData.one_liner || '';
      } else {
        mainText = typeof slideData === 'string' ? slideData : (slideData?.text || '');
      }

      let pFontSize = 42;
      let pLines;
      while (true) {
        ctx.font = `bold ${pFontSize}px ${fontStack}`;
        pLines   = wrapLines(ctx, mainText, maxWidth);
        if (pLines.length * pFontSize * 1.4 <= bottomZoneH - 80 || pFontSize <= 20) break;
        pFontSize -= 4;
      }
      const pLineH  = pFontSize * 1.4;
      const blockH  = pLines.length * pLineH;
      const blockTopY = blockCY - blockH / 2;

      // Quotation mark
      ctx.font         = `bold 80px ${fontStack}`;
      ctx.fillStyle    = GOLD;
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('\u201C', blockX, blockTopY - 50);

      ctx.font         = `bold ${pFontSize}px ${fontStack}`;
      ctx.fillStyle    = CHARCOAL;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      drawTextBlock(ctx, pLines, W / 2, blockCY, pLineH);

      // Wow factor sub-text (tool-spotlight only)
      if (post_type === 'tool-spotlight' && typeof slideData === 'object' && slideData.wow_factor) {
        const wowY = blockCY + blockH / 2 + 24;
        ctx.font         = `italic 18px Arial, sans-serif`;
        ctx.fillStyle    = 'rgba(0,0,0,0.45)';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(slideData.wow_factor, W / 2, wowY);
      }

      // Source sub-text (stat-carousel fallback handled above)

      ctx.font         = '16px Arial, sans-serif';
      ctx.fillStyle    = 'rgba(0,0,0,0.2)';
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('@cuttingedgeofai', W - 28, H - 18);
    }

    drawBrandLogo(ctx, logoImg);
    paths.push(saveCanvas(canvas, path.join(folder, `slide_0${i + 2}.jpg`)));
  }

  // ── Slide 7: CTA ─────────────────────────────────────────────────────────
  {
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');

    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 0, W, H);

    const ctaBg = await fetchPhotoWithFallback('success achievement technology minimal dark', 'landscape');
    if (ctaBg) drawImageCover(ctx, ctaBg, 0, 0, W, H);
    else drawGradientFill(ctx, 0, 0, W, H);

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(0,0,0,0.1)');
    grad.addColorStop(1, 'rgba(0,0,0,0.80)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    const bottomZoneTop  = H * 0.62;
    const fontStack2     = '"Arial Black", Impact, Arial, sans-serif';
    const ctaDisplay     = caption_cta || 'Save this. Your future self will thank you.';

    ctx.font         = `bold 36px ${fontStack2}`;
    ctx.fillStyle    = '#FFFFFF';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('SAVE THIS.', W / 2, bottomZoneTop);

    ctx.font      = 'italic 24px Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    // Wrap CTA text
    const ctaLines = wrapLines(ctx, ctaDisplay, W * 0.80);
    let ctaY = bottomZoneTop + 56;
    for (const line of ctaLines.slice(0, 3)) {
      ctx.fillText(line, W / 2, ctaY);
      ctaY += 34;
    }

    ctx.font      = `22px ${fontStack2}`;
    ctx.fillStyle = GOLD;
    ctx.fillText('@cuttingedgeofai', W / 2, ctaY + 12);

    drawBrandLogo(ctx, logoImg);
    paths.push(saveCanvas(canvas, path.join(folder, 'slide_07.jpg')));
  }

  return paths;
}

// ─── Legacy shim ─────────────────────────────────────────────────────────────

async function renderQuoteImage({ text, outputPath }) {
  const p = await renderQuoteSlide(text);
  if (outputPath) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(p, outputPath);
    return outputPath;
  }
  return p;
}

module.exports = {
  getOutputFolder,
  fetchAndSaveBrandLogo,
  renderQuoteSlide,
  renderNewsCarousel,
  renderNewsHookImage,
  renderResourceCarousel,
  renderQuoteImage,   // legacy
};
