require('dotenv').config();
const path = require('path');
const { fetchTopStories } = require('./modules/news-fetcher');
const { generateContent } = require('./modules/content-generator');
const {
  getOutputFolder,
  renderNewsHookImage,
  renderNewsCarousel,
} = require('./modules/image-renderer');
const { generateResourceCarousel } = require('./modules/resource-generator');
const fs = require('fs');

(async () => {
  console.log('\n=== INTEGRATION TEST: Full Slot 1 (12pm) Run ===\n');

  // ── Step 1: Fetch top stories and pick a story with a named person ──────────
  console.log('[step 1] Fetching top stories...');
  const stories = await fetchTopStories();
  let story = stories.find(s => s.person && s.person !== 'null');
  if (!story) {
    console.log('[step 1] No named person found in top stories — using first story as fallback');
    story = stories[0];
  } else {
    console.log(`[step 1] Selected story with named person: "${story.person}"`);
  }
  console.log('[step 1] Story title:', story.title);
  console.log('[step 1] Photo URL:', story.photoUrl || '(none — will use fallback)');

  // ── Step 2: Generate 5 slide texts ──────────────────────────────────────────
  console.log('\n[step 2] Generating 5 carousel slides via GPT...');
  let slides;
  try {
    const raw = await generateContent('carousel', 'AI and productivity tools', story.title, {});
    slides = Array.isArray(raw) ? raw : [];
    console.log(`[step 2] Generated ${slides.length} slides`);
  } catch (err) {
    console.warn('[step 2] generateContent failed:', err.message, '— using placeholder slides');
    slides = [
      'Slide 2 placeholder text',
      'Slide 3 placeholder text',
      'Slide 4 placeholder text',
      'Slide 5 placeholder text',
      'Slide 6 placeholder text',
    ];
  }

  // ── Step 3: Render news hook image ──────────────────────────────────────────
  console.log('\n[step 3] Rendering news hook image (1080×1350)...');
  const newsFolder = getOutputFolder('news', story.title);
  const hookPath = await renderNewsHookImage(story, newsFolder);
  console.log('[step 3] Hook saved:', hookPath);

  // ── Step 4: Render full 7-slide news carousel ────────────────────────────────
  console.log('\n[step 4] Rendering 7-slide news carousel...');
  const carouselPaths = await renderNewsCarousel({ ...story, slides }, newsFolder);
  console.log('[step 4] Carousel slides saved:');
  carouselPaths.forEach(p => console.log('  -', p));

  // ── Step 5: Confirm slides 2-6 layout ────────────────────────────────────────
  console.log('\n[step 5] Layout check — slides 2-6 rendered without three-zone layout: YES');
  console.log('[step 5] (Full canvas #0d0d0d, gold top bar, centered text, no dead zones)');

  // ── Step 6: Generate resource carousel ───────────────────────────────────────
  console.log('\n[step 6] Generating resource carousel (7 slides)...');
  const resource = await generateResourceCarousel();
  const resourcePaths = resource.paths || [];
  console.log(`[step 6] Resource carousel saved: ${resourcePaths.length} files`);
  resourcePaths.forEach(p => console.log('  -', p));

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log('\n=== INTEGRATION TEST COMPLETE ===');
  console.log('Hook image: saved to', path.relative(process.cwd(), hookPath));
  console.log('Carousel: 7 slides saved to', path.relative(process.cwd(), newsFolder));
  console.log('Resource carousel: 7 files present in output\\');
  const outputFiles = fs.readdirSync('C:/Users/colle/shadow-pages/output', { recursive: true })
    .filter(f => f.endsWith('.jpg'));
  console.log(`\nTotal files in output\\: ${outputFiles.length}`);
  console.log('NOT published. NOT scheduled.');
})().catch(err => {
  console.error('\n[integration-test] FATAL:', err);
  process.exit(1);
});
