'use strict';
require('dotenv').config();
const { createCanvas, loadImage, registerFont } = require('canvas');
const path  = require('path');
const fs    = require('fs');
const os    = require('os');
const { fetchSlideImage }  = require('./carousel-builder');
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

// ── Photo fetching ────────────────────────────────────────────────────────────
// Tries Google Custom Search API first (if keys present), falls back to Pexels.
// Person name is always passed raw — no transformation.

async function fetchPressPhoto(subject) {
  if (!subject) return null;

  // 1. Google Custom Search API
  const gKey = process.env.GOOGLE_CSE_API_KEY;
  const gCx  = process.env.GOOGLE_CSE_CX;
  if (gKey && gCx) {
    try {
      const url = `https://www.googleapis.com/customsearch/v1?key=${gKey}&cx=${gCx}&searchType=image&q=${encodeURIComponent(subject)}&num=1&imgSize=large`;
      const res  = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const imgUrl = data.items?.[0]?.link;
        if (imgUrl) {
          const imgRes = await fetch(imgUrl);
          if (imgRes.ok) {
            const tmpPath = path.join(os.tmpdir(), `gcse_${Date.now()}.jpg`);
            fs.writeFileSync(tmpPath, Buffer.from(await imgRes.arrayBuffer()));
            console.log(`[photo] Google CSE hit for: ${subject}`);
            return tmpPath;
          }
        }
      }
    } catch (err) {
      console.warn('[photo] Google CSE failed:', err.message);
    }
  }

  // 2. Pexels fallback (raw subject, no transformation)
  const pexelsPath = await fetchSlideImage(subject);
  if (pexelsPath) {
    console.log(`[photo] Pexels hit for: ${subject}`);
    return pexelsPath;
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
async function renderCoverSlide(d, folder, slideNum, totalSlides, isCarousel = true) {
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // Gradient fallback base
  const fallbackGrad = ctx.createLinearGradient(0, 0, 0, H);
  fallbackGrad.addColorStop(0, '#0d0d0d');
  fallbackGrad.addColorStop(1, '#1a1a1a');
  ctx.fillStyle = fallbackGrad;
  ctx.fillRect(0, 0, W, H);

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

  // ── Watermark (top center) ────────────────────────────────────────────────
  const wmText  = 'CUTTING EDGE OF AI';
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

// ── Inner slide — text on dark background ─────────────────────────────────────
async function renderInnerSlide(text, slideNum, totalSlides, folder) {
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, W, H);

  // Gold top strip
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, 0, W, 4);

  // Slide counter (bottom-right, subtle)
  ctx.font         = `14px "Courier New", monospace`;
  ctx.fillStyle    = 'rgba(255,255,255,0.25)';
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${slideNum} / ${totalSlides}`, W - PAD, H - PAD);

  // Text — centered, auto-sized, word-wrapped
  const textMaxW = W - 2 * (PAD + 20);
  const textStr  = String(text || '');
  let fontSize   = 64;
  ctx.font       = `bold ${fontSize}px ${FONT_DISPLAY}`;
  let lines      = wrapLines(ctx, textStr, textMaxW);

  // Shrink until lines fit or minimum size reached
  while (lines.length > 5 && fontSize > 36) {
    fontSize -= 4;
    ctx.font = `bold ${fontSize}px ${FONT_DISPLAY}`;
    lines    = wrapLines(ctx, textStr, textMaxW);
  }

  const lh         = Math.round(fontSize * 1.15);
  const totalH     = lines.length * lh;
  let ty           = (H - totalH) / 2;

  ctx.font         = `bold ${fontSize}px ${FONT_DISPLAY}`;
  ctx.fillStyle    = WHITE;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  for (const ln of lines) {
    ctx.fillText(ln, W / 2, ty);
    ty += lh;
  }

  const filename = `slide_${String(slideNum).padStart(2, '0')}.jpg`;
  return saveCanvas(canvas, path.join(folder, filename));
}

// ── CTA Final Slide ───────────────────────────────────────────────────────────
async function renderCtaSlide(ctaKeyword, folder, slideNum, totalSlides) {
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

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

  // ── CTA block — pinned around 54% ────────────────────────────────────────
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

  ctx.font         = `28px ${FONT_BODY}`;
  ctx.fillStyle    = WHITE;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  const ctaLines2 = wrapLines(ctx, "and we'll send you our top AI tools & updates", textMaxW);
  for (const ln of ctaLines2) {
    ctx.fillText(ln, W / 2, cy);
    cy += 38;
  }

  // ── Bottom account info — pinned to bottom 15% ───────────────────────────
  const bottomY = Math.round(H * 0.82);

  ctx.font         = `bold 26px ${FONT_DISPLAY}`;
  ctx.fillStyle    = WHITE;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('@CuttingEdgeOfAI', W / 2, bottomY);

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
  const totalSlides  = 1 + innerSlides.length + 1; // cover + inner + CTA
  const paths        = [];

  console.log(`[news-carousel-v2] Rendering ${totalSlides} slides...`);

  // Slide 1: Cover
  paths.push(await renderCoverSlide(d, folder, 1, totalSlides, true));
  console.log('[news-carousel-v2] Cover slide done');

  // Slides 2 through N-1: Inner content slides
  for (let i = 0; i < innerSlides.length; i++) {
    paths.push(await renderInnerSlide(innerSlides[i], i + 2, totalSlides, folder));
    console.log(`[news-carousel-v2] Inner slide ${i + 2} done`);
  }

  // Final slide: CTA
  paths.push(await renderCtaSlide(d.cta_keyword || 'BREAKING', folder, totalSlides, totalSlides));
  console.log('[news-carousel-v2] CTA slide done');

  console.log(`[news-carousel-v2] All ${totalSlides} slides saved to: ${folder}`);
  return paths;
}

module.exports = { renderNewsCarouselV2, renderCoverSlide, renderInnerSlide, renderCtaSlide };
