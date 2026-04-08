'use strict';
require('dotenv').config();
const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const fs   = require('fs');
const { fetchSlideImage } = require('./carousel-builder');

// ── Font registration ─────────────────────────────────────────────────────────
for (const f of [
  { path: 'C:/Windows/Fonts/ariblk.ttf', family: 'Arial Black' },
  { path: 'C:/Windows/Fonts/impact.ttf',  family: 'Impact' },
]) {
  try { if (fs.existsSync(f.path)) registerFont(f.path, { family: f.family }); }
  catch (_) {}
}

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

  const tmpPath = await fetchSlideImage(query);
  if (tmpPath) {
    try {
      const img = await loadImage(tmpPath);
      try { fs.unlinkSync(tmpPath); } catch (_) {}
      console.log(`[resource-carousel] Pexels photo: ${query}`);
      return img;
    } catch (_) {}
  }

  console.log(`[resource-carousel] No photo for "${query}" — using gradient`);
  return null;
}

// ── Watermark (top center, "CUTTING EDGE OF AI" with flanking lines) ──────────
function drawWatermark(ctx) {
  const wmText = 'CUTTING EDGE OF AI';
  const wmSize = 22;
  ctx.font     = `bold ${wmSize}px ${FONT_DISPLAY}`;
  const wmW    = ctx.measureText(wmText).width;
  const wmY    = PAD;
  const wmX    = W / 2;
  const lineY  = wmY + wmSize / 2;
  const gap    = 10;

  ctx.save();
  ctx.strokeStyle = WHITE; ctx.lineWidth = 1; ctx.globalAlpha = 0.7;
  ctx.beginPath(); ctx.moveTo(wmX - wmW / 2 - gap - wmW * 0.6, lineY); ctx.lineTo(wmX - wmW / 2 - gap, lineY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(wmX + wmW / 2 + gap, lineY); ctx.lineTo(wmX + wmW / 2 + gap + wmW * 0.6, lineY); ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.9; ctx.fillStyle = WHITE; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  const letters = wmText.split('');
  const charSpacing = 3;
  const totalWmW = wmW + charSpacing * (letters.length - 1);
  let lx = wmX - totalWmW / 2;
  for (const ch of letters) {
    ctx.fillText(ch, lx, wmY);
    lx += ctx.measureText(ch).width + charSpacing;
  }
  ctx.restore();
}

// ── Cover slide ───────────────────────────────────────────────────────────────
async function renderResourceCoverSlide(postType, hookText, folder) {
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // Dark gradient base
  const base = ctx.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#0d0d0d'); base.addColorStop(1, '#1a1a1a');
  ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);

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

  drawWatermark(ctx);

  // Headline — bottom 40%
  const zoneTop  = Math.round(H * 0.60);
  const zoneH    = H - zoneTop;
  const textMaxW = W - 2 * PAD;
  const headline = hookText.toUpperCase();

  let hSize = 72;
  ctx.font  = `bold ${hSize}px ${FONT_DISPLAY}`;
  let hLines = wrapLines(ctx, headline, textMaxW);
  while ((hLines.length > 3 || ctx.measureText(hLines[0] || '').width > textMaxW) && hSize > 48) {
    hSize -= 4;
    ctx.font  = `bold ${hSize}px ${FONT_DISPLAY}`;
    hLines = wrapLines(ctx, headline, textMaxW);
  }
  hLines = hLines.slice(0, 3);

  const subtitle  = postType.replace(/-/g, ' ').toUpperCase();
  const subSize   = 26;
  ctx.font = `${subSize}px ${FONT_BODY}`;
  const subLines = wrapLines(ctx, subtitle, textMaxW).slice(0, 1);
  const subLH    = subSize * 1.35;

  const hLH        = Math.round(hSize * 0.95);
  const totalTextH = hLines.length * hLH + (subLines.length > 0 ? 16 + subLines.length * subLH : 0);
  const blockStartY = zoneTop + (zoneH - totalTextH) / 2;

  let ty = blockStartY;
  ctx.font = `bold ${hSize}px ${FONT_DISPLAY}`; ctx.fillStyle = WHITE;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const ln of hLines) { ctx.fillText(ln, W / 2, ty); ty += hLH; }

  if (subLines.length > 0) {
    ty += 16;
    ctx.font = `${subSize}px ${FONT_BODY}`; ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (const ln of subLines) { ctx.fillText(ln, W / 2, ty); ty += subLH; }
  }

  // SWIPE badge (bottom-right)
  const badgeW = 100, badgeH = 36;
  const badgeX = W - PAD - badgeW, badgeY = H - PAD - badgeH;
  ctx.fillStyle = GOLD;
  roundRectFill(ctx, badgeX, badgeY, badgeW, badgeH, 8);
  ctx.font = `bold 20px ${FONT_DISPLAY}`; ctx.fillStyle = '#000000';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('SWIPE', badgeX + badgeW / 2, badgeY + badgeH / 2);

  return saveCanvas(canvas, path.join(folder, 'slide_01.jpg'));
}

// ── Inner slide (Type B spec: gold top strip, label, white bold centered text) ─
async function renderResourceInnerSlide(text, label, slideNum, totalSlides, folder) {
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  ctx.fillStyle = '#0d0d0d'; ctx.fillRect(0, 0, W, H);

  // Gold top strip
  ctx.fillStyle = GOLD; ctx.fillRect(0, 0, W, 4);

  // Label — gold, Arial Black, 16px, letter-spaced, top center
  const labelText    = (label || 'HOW TO GUIDE').toUpperCase();
  ctx.font           = `bold 16px ${FONT_DISPLAY}`;
  ctx.fillStyle      = GOLD;
  ctx.textBaseline   = 'top';
  ctx.textAlign      = 'left';
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

  // Body — white, Arial Black, max 12 words, centered
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
  lines = lines.slice(0, 4);

  const lh     = Math.round(fontSize * 1.15);
  const totalH = lines.length * lh;
  let   ty     = (H - totalH) / 2;

  ctx.font = `bold ${fontSize}px ${FONT_DISPLAY}`; ctx.fillStyle = WHITE;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const ln of lines) { ctx.fillText(ln, W / 2, ty); ty += lh; }

  // Slide counter
  ctx.font = `14px "Courier New", monospace`; ctx.fillStyle = 'rgba(255,255,255,0.20)';
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillText(`${slideNum} / ${totalSlides}`, W - PAD, H - PAD);

  return saveCanvas(canvas, path.join(folder, `slide_${String(slideNum).padStart(2, '0')}.jpg`));
}

// ── CTA slide (matches news carousel CTA — no follower count) ─────────────────
async function renderResourceCtaSlide(folder, slideNum, totalSlides) {
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  ctx.fillStyle = '#0d0d0d'; ctx.fillRect(0, 0, W, H);

  const textPad  = 60;
  const textMaxW = W - 2 * textPad;

  // Top question — vertically centered in top 35%
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

  // Account info — bottom ~18%
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
  const { post_type, hook_text, slides = [] } = content;
  const label       = post_type === 'tool-spotlight' ? 'TOOL SPOTLIGHT' : 'HOW TO GUIDE';
  const innerCount  = Math.min(slides.length, 5);
  const totalSlides = 1 + innerCount + 1;
  const paths       = [];

  console.log(`[resource-carousel] Rendering ${totalSlides} slides (${post_type})...`);

  paths.push(await renderResourceCoverSlide(post_type, hook_text, folder));
  console.log('[resource-carousel] Cover done');

  for (let i = 0; i < innerCount; i++) {
    const slideData = slides[i];
    const text = typeof slideData === 'string'
      ? slideData
      : (slideData?.one_liner || slideData?.stat || slideData?.text || '');
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
