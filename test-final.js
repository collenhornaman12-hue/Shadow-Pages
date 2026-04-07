// test-final.js — verifies the full redesigned pipeline end-to-end.
// Uses static content (no OpenAI required) to render and save test images.
// Run with: node test-final.js

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { renderQuoteImage } = require('./modules/image-renderer');
const { buildCarousel } = require('./modules/carousel-builder');

const ROOT = __dirname;

// ─── Test 1: Quote image ──────────────────────────────────────────────────────

async function testQuote() {
  console.log('\n=== [1/2] Quote Image ===');
  const text = 'OpenAI revenue grew 1700% in 18 months.';
  const outputPath = path.join(ROOT, 'test-quote-final.jpg');

  await renderQuoteImage({
    text,
    bgPath: null,
    outputPath,
    slideType: 'quote',
  });

  const stat = fs.statSync(outputPath);
  console.log(`✓ Saved: ${outputPath} (${Math.round(stat.size / 1024)}KB)`);
  return outputPath;
}

// ─── Test 2: Carousel ─────────────────────────────────────────────────────────

async function testCarousel() {
  console.log('\n=== [2/2] Carousel Slides ===');

  // Simulate the new carousel JSON structure from the upgraded prompt
  const carouselData = {
    slide_count: 7,
    hook: "Most people don't know what AI can already do to their job.",
    slides: [
      "ChatGPT can now browse the web, write code, and run it — all in one message.",
      "Perplexity replaced Google for 10M users in under 18 months.",
      "Runway Gen-3 generates 10-second videos from a single text prompt.",
      "Notion AI rewrites entire documents in your voice without you touching a word.",
      "Claude 3 Opus scored higher than GPT-4 on every legal and medical benchmark.",
    ],
    payoff: "The tools that existed 6 months ago are already obsolete. The pace isn't slowing.",
    cta: "Follow @cuttingedgeofai — new AI tools daily.",
    visual_context: [
      "futuristic AI neural network dark",
      "person using laptop AI tools",
      "search engine interface dark minimal",
      "AI video generation technology",
      "minimalist productivity workspace",
      "data benchmark comparison chart",
      "technology evolution timeline",
    ],
  };

  const outputDir = path.join(ROOT, 'test-carousel-final');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const paths = await buildCarousel({
    hook:           carouselData.hook,
    slides:         carouselData.slides,
    payoff:         carouselData.payoff,
    cta:            carouselData.cta,
    visual_context: carouselData.visual_context,
    slide_count:    carouselData.slide_count,
    bgPath:         null,
    outputDir,
    config:         {},
  });

  console.log(`✓ ${paths.length} slides saved to: ${outputDir}`);
  paths.forEach((p, i) => {
    const stat = fs.statSync(p);
    console.log(`  slide_${i + 1}.jpg — ${Math.round(stat.size / 1024)}KB`);
  });

  return paths;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Shadow Pages — Final Design Test ===');
  let errors = 0;

  try {
    await testQuote();
  } catch (err) {
    console.error('[QUOTE ERROR]', err.message);
    errors++;
  }

  try {
    await testCarousel();
  } catch (err) {
    console.error('[CAROUSEL ERROR]', err.message);
    errors++;
  }

  console.log('\n=== DONE ===');
  if (errors > 0) {
    console.error(`${errors} test(s) failed.`);
    process.exit(1);
  } else {
    console.log('All tests passed.');
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
