'use strict';
require('dotenv').config();
const { createCanvas, loadImage, registerFont } = require('canvas');
const path  = require('path');
const fs    = require('fs');
const os    = require('os');
const { fetchSlideImage, buildPhotoQuery, VISUAL_BLOCKLIST, isBlockedPhotoUrl } = require('./carousel-builder');
const { getOutputFolder }  = require('./image-renderer');

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
const H            = 1350;  // 4:5 portrait
const GOLD         = '#E8C547';
const BG           = '#0d0d0d';
const WHITE        = '#ffffff';
const FONT_DISPLAY = '"Arial Black", Impact, Arial, sans-serif';
const FONT_BODY    = 'Arial, sans-serif';
const PAD          = 40;

// ── Utilities ─────────────────────────────────────────────────────────────────

function saveCanvas(canvas, outPath) {
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outPath, canvas.toBuffer('image/jpeg', { quality: 0.93 }));
  return outPath;
}

function wrapLines(ctx, text, maxWidth) {
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

function drawImageCover(ctx, img, x, y, w, h) {
  if (!img) return;
  const srcAR = img.width / img.height;
  const dstAR = w / h;
  let sx, sy, sw, sh;
  if (srcAR > dstAR) {
    sh = img.height; sw = sh * dstAR; sx = (img.width - sw) / 2; sy = 0;
  } else {
    sw = img.width; sh = sw / dstAR; sx = 0; sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function roundRectFill(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

// ── Person map — hardcoded press photo URLs for known subjects ────────────────
// Keys must be lowercase. Lookup checks if subject.toLowerCase() includes the key.
const PERSON_MAP = {
  'sam altman': 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/Sam_Altman_CropEdit.jpg/440px-Sam_Altman_CropEdit.jpg',
};
console.log('[PERSON MAP KEYS]', Object.keys(PERSON_MAP));

// ── Photo validation ──────────────────────────────────────────────────────────
// Returns { valid: true, buf } on pass, or { valid: false, reason } on reject.
// Rejection criteria:
//   - URL contains 'logo', 'icon', 'badge', or 'avatar'
//   - Content-Length < 50KB (when header is present)
//   - Image width/height ratio > 1.5 (landscape banner/logo)
async function validatePhoto(imageUrl) {
  // 1. URL keyword check (fast, no network)
  const urlLower = imageUrl.toLowerCase();
  for (const bad of ['logo', 'icon', 'badge', 'avatar']) {
    if (urlLower.includes(bad)) return { valid: false, reason: `URL contains "${bad}"` };
  }

  // 2. Fetch the image (single request covers size + ratio checks)
  let buf;
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return { valid: false, reason: `HTTP ${res.status}` };

    // Content-type check — must be an image
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      return { valid: false, reason: `Non-image content-type: ${contentType.split(';')[0]}` };
    }

    // Size check via Content-Length header when available
    const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
    if (contentLength > 0 && contentLength < 51200) {
      return { valid: false, reason: `Too small: ${contentLength} bytes` };
    }

    buf = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    return { valid: false, reason: `Fetch error: ${err.message}` };
  }

  // Size check via actual buffer when header was absent
  if (buf.length < 51200) {
    return { valid: false, reason: `Too small: ${buf.length} bytes` };
  }

  // 3. Ratio check — load image and measure dimensions
  try {
    const img = await loadImage(buf);
    if (img.width / img.height > 1.5) {
      return { valid: false, reason: `Landscape ratio ${(img.width / img.height).toFixed(2)}` };
    }
  } catch (err) {
    return { valid: false, reason: `Image decode failed: ${err.message}` };
  }

  return { valid: true, buf };
}

// ── Photo fetching ────────────────────────────────────────────────────────────
// Tries SerpApi Google Images first (if key present), falls back to Pexels with
// a generic finance query. Raw entity name is NEVER passed to Pexels to avoid
// product photos (e.g. "Blackstone" returning a BBQ grill).
// Fallback chain: SerpApi (entity name) → Pexels ("finance investment wealth") → gradient
// Set DEBUG=true in env to enable verbose per-step logging.

async function fetchPressPhoto(subject) {
  if (!subject) return null;
  const debug      = process.env.DEBUG === 'true';
  const queryLower = subject.toLowerCase();

  // 0. Person map lookup — known subjects bypass SerpApi entirely
  console.log('[PERSON LOOKUP] Checking for:', subject);
  const matchedKey = Object.keys(PERSON_MAP).find(k => queryLower.includes(k));
  if (matchedKey) {
    const mapUrl = PERSON_MAP[matchedKey];
    console.log('[PERSON LOOKUP] Hit:', mapUrl);
    const check = await validatePhoto(mapUrl);
    if (check.valid) {
      const tmpPath = path.join(os.tmpdir(), `personmap_${Date.now()}.jpg`);
      fs.writeFileSync(tmpPath, check.buf);
      return tmpPath;
    }
    console.warn(`[PERSON LOOKUP] Hit URL failed validation (${check.reason}) — falling to SerpApi`);
  } else {
    console.log('[PERSON LOOKUP] Miss — falling to SerpApi');
  }

  // 1. SerpApi Google Images — blocklist checked on URL before downloading
  const serpKey = process.env.SERPAPI_KEY;
  if (serpKey) {
    if (debug) console.log(`[photo] SerpApi — source: Google Images, query: "${subject}"`);
    try {
      const url = `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(subject)}&api_key=${serpKey}`;
      const res  = await fetch(url);
      if (!res.ok) {
        console.warn(`[photo] SerpApi HTTP ${res.status} for: ${subject}`);
      } else {
        const data   = await res.json();
        const imgUrl = data.images_results?.[0]?.original;
        if (debug) console.log(`[photo] SerpApi returned result: ${imgUrl ? 'yes' : 'none'}`);
        if (imgUrl) {
          if (isBlockedPhotoUrl(imgUrl, queryLower)) {
            console.warn(`[photo] SerpApi blocked (visual mismatch): ${imgUrl.slice(0, 80)}`);
          } else {
            const check = await validatePhoto(imgUrl);
            if (!check.valid) {
              console.warn(`[photo] SerpApi rejected (${check.reason}): ${subject}`);
            } else {
              const tmpPath = path.join(os.tmpdir(), `serpapi_${Date.now()}.jpg`);
              fs.writeFileSync(tmpPath, check.buf);
              console.log(`[photo] SerpApi hit for: ${subject}`);
              return tmpPath;
            }
          }
        }
      }
    } catch (err) {
      console.warn('[photo] SerpApi failed:', err.message);
    }
  } else {
    if (debug) console.log('[photo] SerpApi not configured (SERPAPI_KEY missing)');
  }

  // 2. Pexels fallback — inlined to expose URL for blocklist check
  // Query is generic/editorial to avoid crypto/tablet imagery as press photo fallback
  const PEXELS_FALLBACK = 'technology executive professional';
  const pexelsKey = process.env.PEXELS_API_KEY;
  if (pexelsKey) {
    if (debug) console.log(`[photo] Pexels fallback — query: "${PEXELS_FALLBACK}"`);
    try {
      const searchRes = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(PEXELS_FALLBACK)}&per_page=5`,
        { headers: { Authorization: pexelsKey } }
      );
      if (searchRes.ok) {
        const data = await searchRes.json();
        for (const photo of (data.photos || [])) {
          const photoUrl = photo.src?.large2x;
          if (!photoUrl) continue;
          if (isBlockedPhotoUrl(photoUrl, queryLower)) {
            console.warn(`[photo] Pexels blocked (visual mismatch): ${photoUrl.slice(0, 80)}`);
            continue;
          }
          const imgRes = await fetch(photoUrl);
          if (!imgRes.ok) continue;
          const tmpPath = path.join(os.tmpdir(), `pexels_${Date.now()}.jpg`);
          fs.writeFileSync(tmpPath, Buffer.from(await imgRes.arrayBuffer()));
          console.log(`[photo] Pexels hit (fallback) for: ${subject}`);
          return tmpPath;
        }
      }
    } catch (err) {
      console.warn('[photo] Pexels failed:', err.message);
    }
  }

  console.log(`[photo] No photo found for: ${subject} — using gradient fallback`);
  return null;
}

async function loadPhotoImage(subject) {
  const tmpPath = await fetchPressPhoto(subject);
  if (!tmpPath) return null;
  try {
    const img = await loadImage(tmpPath);
    try { fs.unlinkSync(tmpPath); } catch (_) {}
    return img;
  } catch (_) {
    try { fs.unlinkSync(tmpPath); } catch (_) {}
    return null;
  }
}

// ── SLIDE 1 — Cover (full-bleed press photo) ─────────────────────────────────
async function renderCoverSlide(d, folder, slideNum, totalSlides, isCarousel = true, watermarkText = 'CUTTING EDGE OF AI') {
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // Gradient fallback base
  const fallbackGrad = ctx.createLinearGradient(0, 0, 0, H);
  fallbackGrad.addColorStop(0, '#0d0d0d');
  fallbackGrad.addColorStop(1, '#1a1a1a');
  ctx.fillStyle = fallbackGrad;
  ctx.fillRect(0, 0, W, H);

  // Full-bleed press photo + overlay (only when photo is available)
  const photoQuery = buildPhotoQuery(d.photo_subject, d.person_name);
  console.log('[STORY SHAPE]', Object.keys(d));
  const isWealthy = (watermarkText || '').toUpperCase().includes('WEALTHY');
  console.log(`${isWealthy ? '[WEALTHY PHOTO QUERY]' : '[PHOTO QUERY]'} cover: "${photoQuery}"`);
  let img = await loadPhotoImage(photoQuery);
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

  // ── Watermark (top center) ────────────────────────────────────────────────
  const wmText  = watermarkText;
  const wmSize  = 22;
  ctx.font      = `bold ${wmSize}px ${FONT_DISPLAY}`;
  ctx.fillStyle = WHITE;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';

  // Measure text for the horizontal lines
  const wmW   = ctx.measureText(wmText).width;
  const wmY   = 40;
  const wmX   = W / 2;
  const lineY = wmY + wmSize / 2;
  const gap   = 10; // gap between text and line

  // Left line
  ctx.strokeStyle = WHITE;
  ctx.lineWidth   = 1;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.moveTo(wmX - wmW / 2 - gap - wmW * 0.6, lineY);
  ctx.lineTo(wmX - wmW / 2 - gap, lineY);
  ctx.stroke();
  // Right line
  ctx.beginPath();
  ctx.moveTo(wmX + wmW / 2 + gap, lineY);
  ctx.lineTo(wmX + wmW / 2 + gap + wmW * 0.6, lineY);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Watermark text (letter-spacing simulated by drawing char by char)
  ctx.fillStyle    = WHITE;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.globalAlpha  = 0.9;
  // Draw with letter-spacing by spreading characters
  const letters     = wmText.split('');
  const charSpacing = 3;
  const totalWmW    = wmW + charSpacing * (letters.length - 1);
  let lx = wmX - totalWmW / 2;
  ctx.textAlign    = 'left';
  for (const ch of letters) {
    ctx.fillText(ch, lx, wmY);
    lx += ctx.measureText(ch).width + charSpacing;
  }
  ctx.globalAlpha = 1;

  // ── Headline (bottom 40% of canvas, centered horizontally) ───────────────
  const zoneTop    = Math.round(H * 0.60); // bottom 40% starts at 810px
  const zoneH      = H - zoneTop;          // 540px
  const textMaxW   = W - 2 * PAD;
  const headline   = String(d.headline || '').toUpperCase();

  // Auto-size: start at 72px, shrink to fit within 3 lines
  let hSize = 72;
  ctx.font  = `bold ${hSize}px ${FONT_DISPLAY}`;
  let hLines = wrapLines(ctx, headline, textMaxW);
  while ((hLines.length > 3 || (hLines.length > 0 && ctx.measureText(hLines[0]).width > textMaxW)) && hSize > 48) {
    hSize -= 4;
    ctx.font  = `bold ${hSize}px ${FONT_DISPLAY}`;
    hLines = wrapLines(ctx, headline, textMaxW);
  }
  // Truncate to 3 lines
  hLines = hLines.slice(0, 3);

  const subtitle  = String(d.subtitle || '').toUpperCase();
  const subSize   = 28;
  ctx.font = `${subSize}px ${FONT_BODY}`;
  const subLines  = wrapLines(ctx, subtitle, textMaxW).slice(0, 2);
  const subLH     = subSize * 1.35;

  // Calculate total text block height
  const hLH       = Math.round(hSize * 0.95);
  const totalTextH = hLines.length * hLH + (subLines.length > 0 ? 16 + subLines.length * subLH : 0);
  const blockStartY = zoneTop + (zoneH - totalTextH) / 2;

  // Draw headline lines (white, centered)
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  let ty = blockStartY;
  ctx.font      = `bold ${hSize}px ${FONT_DISPLAY}`;
  ctx.fillStyle = WHITE;
  for (const ln of hLines) {
    ctx.fillText(ln, W / 2, ty);
    ty += hLH;
  }

  // Draw subtitle (below headline, 16px gap)
  if (subLines.length > 0) {
    ty += 16;
    ctx.font      = `${subSize}px ${FONT_BODY}`;
    ctx.fillStyle = 'rgba(255,255,255,0.80)';
    for (const ln of subLines) {
      ctx.fillText(ln, W / 2, ty);
      ty += subLH;
    }
  }

  // ── SWIPE badge (bottom-right, carousel only) ─────────────────────────────
  if (isCarousel) {
    const badgeW  = 100;
    const badgeH  = 36;
    const badgeX  = W - PAD - badgeW;
    const badgeY  = H - PAD - badgeH;
    ctx.fillStyle = GOLD;
    roundRectFill(ctx, badgeX, badgeY, badgeW, badgeH, 8);
    ctx.font         = `bold 20px ${FONT_DISPLAY}`;
    ctx.fillStyle    = '#000000';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SWIPE', badgeX + badgeW / 2, badgeY + badgeH / 2);
  }

  const filename = `slide_${String(slideNum).padStart(2, '0')}.jpg`;
  return saveCanvas(canvas, path.join(folder, filename));
}

// ── Inner slides ──────────────────────────────────────────────────────────────
// data: { type: 'source', source_name, source_headline } | { type: 'text', text }

async function renderInnerSlide(data, slideNum, totalSlides, folder, sourceSuffix = ' — AI News') {
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

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

    // Pre-measure headline to calculate total content height for vertical centering
    ctx.font = `36px ${FONT_BODY}`;
    const hLines = wrapLines(ctx, String(data.source_headline || ''), innerW).slice(0, 3);
    const sourceLabelH  = 50;   // gold label + gap
    const dividerH      = 28;   // rule + gap
    const headlineH     = hLines.length * 48;
    const postHeadlineH = 20;   // gap after headline
    const attributionH  = 28;   // footer line
    const totalContentH = sourceLabelH + dividerH + headlineH + postHeadlineH + attributionH;

    // Vertically center within card; fall back to original top-aligned if content is too tall
    let cursorY;
    if (totalContentH > cardH * 0.85) {
      cursorY = cardY + 56;
    } else {
      cursorY = cardY + Math.round((cardH - totalContentH) / 2);
    }

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
    ctx.fillText(`via ${String(data.source_name || 'Source')}${sourceSuffix}`, innerX, cursorY);

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

      // Layer 2: Primary — WHITE, Arial Black, top-anchored
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

      // Top-anchored — no vertical centering math
      const hasSecondary  = data.secondary && String(data.secondary).trim().length > 0;
      const secondarySize = 28;
      const secondaryLH   = secondarySize * 1.35;
      let   ty            = 160;

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
        const secWords = String(data.secondary).split(/\s+/).slice(0, 20);
        const secStr   = secWords.join(' ');
        const secLines = wrapLines(ctx, secStr, textMaxW).slice(0, 3);
        for (const ln of secLines) {
          ctx.fillText(ln, W / 2, ty);
          ty += secondaryLH;
        }
      }
    }
  }

  // Slide number — faded, bottom-right, "N / M" format, 20% opacity
  ctx.font         = `14px "Courier New", monospace`;
  ctx.fillStyle    = 'rgba(255,255,255,0.20)';
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${slideNum} / ${totalSlides}`, W - PAD, H - PAD);

  const filename = `slide_${String(slideNum).padStart(2, '0')}.jpg`;
  return saveCanvas(canvas, path.join(folder, filename));
}

// ── CTA Final Slide ───────────────────────────────────────────────────────────
async function renderCtaSlide(ctaKeyword, folder, slideNum, totalSlides) {
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  const keyword = (ctaKeyword || 'BREAKING').toUpperCase();
  console.log(`[cta] post_type=news_carousel keyword=${keyword}`);

  // Ghost keyword watermark — 96px, 4% opacity, centered
  ctx.save();
  ctx.font         = `bold 96px ${FONT_DISPLAY}`;
  ctx.fillStyle    = 'rgba(255,255,255,0.04)';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(keyword, W / 2, H / 2);
  ctx.restore();

  const textPad  = 60;
  const textMaxW = W - 2 * textPad;

  // ── Top question — pinned to top 20% ────────────────────────────────────
  const question = 'WANT THE LATEST AI NEWS EVERY DAY?';
  let qSize = 52;
  ctx.font  = `bold ${qSize}px ${FONT_DISPLAY}`;
  while (ctx.measureText(question).width > textMaxW && qSize > 32) {
    qSize -= 4;
    ctx.font = `bold ${qSize}px ${FONT_DISPLAY}`;
  }
  const qLines = wrapLines(ctx, question, textMaxW);
  const qLH    = qSize * 1.15;
  const qBlockH = qLines.length * qLH;
  // Vertically center in top 35% zone
  let ty = Math.round((H * 0.35 - qBlockH) / 2);

  ctx.fillStyle    = WHITE;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  for (const ln of qLines) {
    ctx.fillText(ln, W / 2, ty);
    ty += qLH;
  }

  // ── CTA block — pinned around 54% ────────────────────────────────────────
  const beforeKeyword = 'Comment ';
  const keywordPart   = `"${keyword}"`;
  const afterKeyword  = ' for daily drops';
  const fullCtaLine   = `${beforeKeyword}${keywordPart}${afterKeyword}`;

  let ctaSize = 40;
  ctx.font    = `bold ${ctaSize}px ${FONT_DISPLAY}`;
  while (ctx.measureText(fullCtaLine).width > textMaxW && ctaSize > 24) {
    ctaSize -= 4;
    ctx.font = `bold ${ctaSize}px ${FONT_DISPLAY}`;
  }
  let cy = Math.round(H * 0.54);

  // Split-color render: surrounding text WHITE, quoted keyword GOLD
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
  lx += afterW;

  // ── Bottom account info — pinned to bottom 15% ───────────────────────────
  const bottomY = Math.round(H * 0.82);

  ctx.font         = `bold 26px ${FONT_DISPLAY}`;
  ctx.fillStyle    = WHITE;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('@cuttingedgeofai', W / 2, bottomY);

  ctx.font         = `22px ${FONT_BODY}`;
  ctx.fillStyle    = GOLD;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('stan.store/cuttingedgeofai', W / 2, bottomY + 40);

  // Slide counter
  ctx.font         = `14px "Courier New", monospace`;
  ctx.fillStyle    = 'rgba(255,255,255,0.20)';
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${slideNum} / ${totalSlides}`, W - PAD, H - PAD);

  const filename = `slide_${String(slideNum).padStart(2, '0')}.jpg`;
  return saveCanvas(canvas, path.join(folder, filename));
}

// ── Main export ───────────────────────────────────────────────────────────────

async function renderNewsCarouselV2(story, gptData, outputFolder = null) {
  const folder = outputFolder || getOutputFolder('news-v2', story.title || 'news');
  const d      = gptData || {};

  const innerSlides  = Array.isArray(d.slides) ? d.slides : [];
  if (innerSlides.length === 0) {
    console.warn('[news-carousel-v2] No inner slides in gptData — carousel will have only cover + CTA');
  }
  const totalSlides  = 1 + innerSlides.length + 1; // cover + inner + CTA
  const paths        = [];

  console.log(`[news-carousel-v2] Rendering ${totalSlides} slides...`);

  // Slide 1: Cover
  paths.push(await renderCoverSlide(d, folder, 1, totalSlides, true));
  console.log('[news-carousel-v2] Cover slide done');

  // Slides 2 through N-1: Inner content slides
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

  // Final slide: CTA
  paths.push(await renderCtaSlide(d.cta_keyword || 'BREAKING', folder, totalSlides, totalSlides));
  console.log('[news-carousel-v2] CTA slide done');

  console.log(`[news-carousel-v2] All ${totalSlides} slides saved to: ${folder}`);
  return paths;
}

module.exports = { renderNewsCarouselV2, renderCoverSlide, renderInnerSlide, renderCtaSlide, fetchPressPhoto, validatePhoto };
