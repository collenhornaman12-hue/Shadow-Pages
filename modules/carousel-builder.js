const path = require('path');
const fs = require('fs');
const os = require('os');
const { renderQuoteImage } = require('./image-renderer');

// ─── Pexels image fetcher ─────────────────────────────────────────────────────
// Returns a local temp file path if successful, null on any failure.
// Gracefully no-ops when PEXELS_API_KEY is absent.

async function fetchSlideImage(query) {
  if (!process.env.PEXELS_API_KEY) return null;
  try {
    const searchRes = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1`,
      { headers: { Authorization: process.env.PEXELS_API_KEY } }
    );
    if (!searchRes.ok) return null;

    const data = await searchRes.json();
    const photoUrl = data.photos?.[0]?.src?.large2x;
    if (!photoUrl) return null;

    const imgRes = await fetch(photoUrl);
    if (!imgRes.ok) return null;

    const tmpPath = path.join(
      os.tmpdir(),
      `pexels_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`
    );
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    fs.writeFileSync(tmpPath, buffer);
    return tmpPath;
  } catch (err) {
    console.warn('[Pexels] fetchSlideImage failed:', err.message);
    return null;
  }
}

// ─── buildCarousel ────────────────────────────────────────────────────────────
// Accepts the new narrative carousel data structure:
//   { hook, slides[], payoff, cta, visual_context[], slide_count, bgPath, outputDir, config }
//
// Slide order: hook → middle slides → payoff → cta
// Each slide gets: slide number indicator, proportional progress bar, optional Pexels BG.

async function buildCarousel({
  hook,
  slides = [],
  payoff,
  cta,
  visual_context = [],
  slide_count,
  bgPath,
  outputDir,
  config = {},
}) {
  // Assemble the ordered text array, filtering out any undefined/null entries
  const allSlides = [hook, ...slides, payoff, cta].filter(Boolean);
  const total = allSlides.length;
  const paths = [];

  for (let i = 0; i < total; i++) {
    const outputPath = path.join(outputDir, `slide_${i + 1}.jpg`);

    // First slide = hook (larger font), rest = body
    const slideType = i === 0 ? 'hook' : 'body';

    // Attempt to fetch a Pexels image for this slide
    const query = visual_context[i] || null;
    let imagePath = null;
    if (query) {
      imagePath = await fetchSlideImage(query);
    }

    await renderQuoteImage({
      text: allSlides[i],
      bgPath,       // kept for backward compat; renderer ignores it (gradients only)
      outputPath,
      config,
      imagePath,    // Pexels image (or null) — composited at 40% opacity
      slideIndex: i + 1,
      slideCount: total,
      slideType,
    });

    // Clean up temp Pexels file
    if (imagePath && fs.existsSync(imagePath)) {
      try { fs.unlinkSync(imagePath); } catch (_) {}
    }

    paths.push(outputPath);
    console.log(`  [carousel] Slide ${i + 1}/${total} saved: ${outputPath}`);
  }

  return paths;
}

module.exports = { buildCarousel, fetchSlideImage };
