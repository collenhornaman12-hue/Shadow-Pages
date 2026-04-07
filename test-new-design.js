require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { renderQuoteImage } = require('./modules/image-renderer');
const { generateContent } = require('./modules/content-generator');

const ROOT = __dirname;

async function testQuote() {
  console.log('\n=== [1/2] Generating quote via OpenAI ===');
  const quoteText = await generateContent('quote', 'AI and productivity tools');
  console.log('Quote:', quoteText);

  const outputPath = path.join(ROOT, 'test-quote-new.jpg');
  console.log('Rendering quote image...');
  await renderQuoteImage({
    text: quoteText,
    bgPath: null, // no longer used — gradients only
    outputPath,
  });
  console.log('Quote image saved to:', outputPath);
  return outputPath;
}

async function testCarousel() {
  console.log('\n=== [2/2] Generating carousel via OpenAI ===');
  const topic = 'AI tools most people don\'t know exist';
  const data = await generateContent('carousel', 'AI and productivity tools', topic);
  console.log('Carousel data:', JSON.stringify(data, null, 2));

  const outputDir = path.join(ROOT, 'test-carousel-new');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  // Handle both new format {slides: [{title, body}]} and old format {hook, slides[], cta}
  let slideTexts = [];
  if (data.slides && Array.isArray(data.slides)) {
    if (typeof data.slides[0] === 'string') {
      // Old format: flat string array
      const allSlides = [];
      if (data.hook) allSlides.push(data.hook);
      allSlides.push(...data.slides);
      if (data.cta) allSlides.push(data.cta);
      slideTexts = allSlides;
    } else {
      // New format: [{title, body}]
      slideTexts = data.slides.map(s => s.title ? `${s.title}\n${s.body || ''}`.trim() : s.body || '');
    }
  }

  console.log(`Rendering ${slideTexts.length} carousel slides...`);
  const paths = [];
  for (let i = 0; i < slideTexts.length; i++) {
    const slidePath = path.join(outputDir, `slide_${i + 1}.jpg`);
    await renderQuoteImage({
      text: slideTexts[i] || `Slide ${i + 1}`,
      bgPath: null,
      outputPath: slidePath,
    });
    paths.push(slidePath);
    console.log(`  Slide ${i + 1} saved: ${slidePath}`);
  }

  console.log(`Carousel slides saved to: ${outputDir}`);
  return paths;
}

async function main() {
  console.log('=== Shadow Pages — New Design Test ===');
  let quotePath, carouselPaths;

  try {
    quotePath = await testQuote();
  } catch (err) {
    console.error('[QUOTE ERROR]', err.message);
    // Fallback: render with hardcoded text so image output is still produced
    console.log('Falling back to static quote text for image test...');
    const fallbackText = 'Your competitor uses AI. You use Google.';
    quotePath = path.join(__dirname, 'test-quote-new.jpg');
    await renderQuoteImage({ text: fallbackText, bgPath: null, outputPath: quotePath });
    console.log('Fallback quote image saved to:', quotePath);
  }

  try {
    carouselPaths = await testCarousel();
  } catch (err) {
    console.error('[CAROUSEL ERROR]', err.message);
    // Fallback: render a few static slides
    console.log('Falling back to static carousel slides...');
    const outputDir = path.join(__dirname, 'test-carousel-new');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const staticSlides = [
      '7 AI tools that save you 10 hours a week',
      'Perplexity AI — search without ads or hallucinations',
      'Notion AI — turns your notes into structured plans',
      'Otter.ai — transcribes every meeting automatically',
      'Midjourney — generates images from text in seconds',
      'Copy.ai — writes marketing copy in your brand voice',
      'Follow @cuttingedgeofai for daily AI tools',
    ];
    carouselPaths = [];
    for (let i = 0; i < staticSlides.length; i++) {
      const slidePath = path.join(outputDir, `slide_${i + 1}.jpg`);
      await renderQuoteImage({ text: staticSlides[i], bgPath: null, outputPath: slidePath });
      carouselPaths.push(slidePath);
    }
    console.log('Fallback carousel slides saved to:', outputDir);
  }

  console.log('\n=== TEST COMPLETE ===');
  console.log('Quote image:', quotePath);
  console.log('Carousel slides:', carouselPaths ? carouselPaths.length + ' slides' : 'none');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
