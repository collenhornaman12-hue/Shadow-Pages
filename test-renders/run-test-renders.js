'use strict';
/**
 * Offline test render script — no live API calls to GPT or Instagram.
 * Saves renders to test-renders/<type>/ folders.
 * Run: node test-renders/run-test-renders.js
 */
require('dotenv').config();
const path = require('path');
const fs   = require('fs');

const { renderNewsCarouselV2 }   = require('../modules/news-carousel');
const { renderCoverSlide }        = require('../modules/news-carousel');
const { renderResourceCarousel }  = require('../modules/resource-carousel');

const BASE = path.join(__dirname);

async function testNewsCarousel() {
  const folder = path.join(BASE, 'news-carousel');
  fs.mkdirSync(folder, { recursive: true });

  const mockStory = { title: 'OpenAI announces GPT-5 release date', hook_angle: 'The model that changes everything' };
  const mockGpt = {
    headline:        'OPENAI JUST SET A DATE FOR GPT-5 LAUNCH',
    subtitle:        'Everything changes this summer',
    photo_subject:   'Sam Altman',
    source_name:     'TechCrunch',
    source_headline: 'OpenAI confirms GPT-5 arriving in Q3 2026',
    slides: [
      'GPT-5 launches Q3 2026 per OpenAI',  // slide[0] is used by Type A (source card) — keep as string
      { label: 'CONTEXT',     primary: 'Context window triples to 300k tokens',     secondary: '10x larger than GPT-4o context' },
      { label: 'PERFORMANCE', primary: 'Reasoning beats o3 by 40 percent',          secondary: 'Highest score on MMLU and HumanEval' },
      { label: 'PRICING',     primary: 'Enterprise pricing double GPT-4o',          secondary: 'Plus users get day-one access' },
      { label: "WHAT'S NEXT", primary: 'All ChatGPT Plus users get access day one', secondary: 'API rollout follows two weeks later' },
    ],
    caption:     'OpenAI just confirmed the date.\n\nGPT-5 is coming Q3 2026.\n\nFollow us (@cuttingedgeofai) for everything latest from the AI world.\nSource: TechCrunch',
    cta_keyword: 'BREAKING',
  };

  console.log('\n[test] Rendering news carousel...');
  const paths = await renderNewsCarouselV2(mockStory, mockGpt, folder);
  console.log('[test] News carousel done:', paths.length, 'slides');
  return paths;
}

async function testViralDemo() {
  const folder = path.join(BASE, 'viral-demo');
  fs.mkdirSync(folder, { recursive: true });

  const mockGpt = {
    headline:      "THIS GUY CAN'T CODE BUT RUNS AI EMPIRE",
    subtitle:      'Coworkers say he barely understands ML',
    photo_subject: 'Sam Altman',
    person_name:   'Sam Altman',
  };

  console.log('\n[test] Rendering viral demo cover...');
  const imgPath = await renderCoverSlide(mockGpt, folder, 1, 1, false);
  console.log('[test] Viral demo done:', imgPath);
  return [imgPath];
}

async function testResourceCarousel() {
  const folder = path.join(BASE, 'resource-carousel');
  fs.mkdirSync(folder, { recursive: true });

  const mock = {
    post_type:   'how-to-guide',
    hook_text:   'DO THIS WITH AI EVERY MORNING',
    slides: [
      { label: 'STEP 1', primary: 'Dump your full task list into Claude', secondary: 'Use a daily brain dump prompt' },
      { label: 'STEP 2', primary: 'Sort by impact then by time required', secondary: 'Focus on top 3 high-leverage items' },
      { label: 'STEP 3', primary: 'Build schedule around top three tasks', secondary: 'Block deep work time before inbox' },
      { label: 'STEP 4', primary: 'Draft your hardest email with AI help', secondary: 'Give Claude the context and the ask' },
      { label: 'STEP 5', primary: 'Review outputs before touching inbox', secondary: 'Protect the first 90 minutes daily' },
    ],
    caption_cta: "Save this. Comment WORKFLOW and I'll send you 5 more",
  };

  console.log('\n[test] Rendering resource carousel...');
  const paths = await renderResourceCarousel(mock, folder);
  console.log('[test] Resource carousel done:', paths.length, 'slides');
  return paths;
}

(async () => {
  console.log('=== Shadow Pages Test Renders ===');
  const results = {};
  const errors  = [];

  try { results.news     = await testNewsCarousel();    } catch (e) { errors.push(`news-carousel: ${e.message}`);     console.error('[test] news-carousel FAILED:', e.message); }
  try { results.viral    = await testViralDemo();       } catch (e) { errors.push(`viral-demo: ${e.message}`);        console.error('[test] viral-demo FAILED:', e.message); }
  try { results.resource = await testResourceCarousel(); } catch (e) { errors.push(`resource-carousel: ${e.message}`); console.error('[test] resource-carousel FAILED:', e.message); }

  console.log('\n=== Results ===');
  for (const [type, paths] of Object.entries(results)) {
    console.log(`${type}: ${paths.length} slides`);
    for (const p of paths) console.log(`  ${p}`);
  }

  if (errors.length) {
    console.error('\n=== Errors ===');
    errors.forEach(e => console.error('  ', e));
    process.exit(1);
  } else {
    console.log('\n✓ All test renders complete. No errors.');
  }
})();
