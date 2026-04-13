require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const OpenAI = require('openai');
const { renderResourceCarousel } = require('./resource-carousel');
const { getOutputFolder }        = require('./image-renderer');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CACHE_PATH = path.join(__dirname, '../cache/resource-cache.json');

// ─── Rotation configuration ───────────────────────────────────────────────────

const POST_TYPES = [
  'copy-paste-prompts',
  'tool-spotlight',
  'how-to-guide',
  'stat-carousel',
  'copy-paste-prompts',
  'how-to-guide',
  'tool-spotlight',
  'stat-carousel',
];

const SUBCATEGORIES = [
  'writing and content creation',
  'research and learning',
  'coding and automation',
  'marketing and growth',
  'productivity and time management',
];

// ─── Prompts per type ─────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  'copy-paste-prompts': {
    hook:      '5 AI PROMPTS WORTH SAVING',
    cta:       "Comment PROMPTS below and I'll DM you 100 more for free 👇",
    buildPrompt: (sub) =>
      `Generate 5 copy-paste AI prompts for ${sub}.
Each prompt must be immediately usable — paste it directly into ChatGPT or Claude and get results.
These should feel like insider secrets.
Return a JSON array of exactly 5 objects. Each object must have exactly two fields:
- "title": the core prompt action phrase, max 8 words, starts with a verb
- "body": exactly 2 sentences. Sentence 1: what this prompt does. Sentence 2: the concrete result or time saved. No generic filler. No questions. Forward momentum only.
Return only a valid JSON array, no markdown, no preamble.`,
  },

  'tool-spotlight': {
    hook:      "5 AI TOOLS YOU'VE NEVER HEARD OF",
    cta:       "Comment TOOLS and I'll DM you the full list with links 👇",
    buildPrompt: () =>
      `List 5 AI tools that most people haven't discovered.
Rules:
- Tools must be real, publicly available since before 2025, with a live website
- Do NOT invent or hallucinate tools
- Each tool must have a genuine wow factor
Return JSON array with fields:
tool_name, website_url, one_liner (max 8 words), wow_factor (one surprising capability, max 10 words)
Return only a valid JSON array, no other text.`,
  },

  'how-to-guide': {
    hook:      'DO THIS WITH AI EVERY MORNING',
    cta:       "Save this. Comment WORKFLOW and I'll send you 5 more 👇",
    buildPrompt: (sub) =>
      `Write a 5-step AI workflow for ${sub}.
Each step starts with a verb, feels like a pro tip not basic advice. Steps build on each other — tell a story of transformation from start to finish.
Return a JSON array of exactly 5 objects. Each object must have exactly two fields:
- "title": the step action phrase, max 8 words, starts with a verb
- "body": exactly 2 sentences. Sentence 1: what this step does concretely. Sentence 2: the specific benefit or result. No generic filler. No questions. Forward momentum only. Maximum 20 words total for the body field.
Return only a valid JSON array, no markdown, no preamble.`,
  },

  'stat-carousel': {
    hook:      '5 AI STATS THAT WILL SHOCK YOU',
    cta:       'Which stat shocked you most? Comment below 👇',
    buildPrompt: () =>
      `Generate 5 shocking AI statistics.
Rules:
- Each stat must cite a real named organization: McKinsey, Goldman Sachs, Stanford HAI, OpenAI,
  World Economic Forum, Gartner, PwC, MIT, etc.
- Do NOT use vague sources like 'studies show' or 'researchers found' — name the organization
- Stats must be specific with exact numbers
- Each stat should make someone say 'wait, really?'
- Focus on: job displacement, productivity gains, adoption rates, revenue impact, or speed comparisons human vs AI
- The stat field must be exactly one complete sentence, maximum 10 words, must end with a period. The key number must appear within those 10 words. No em-dashes, no colons, no fragments.
Return JSON array with fields: stat, source
Return only a valid JSON array, no other text.`,
  },
};

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function getDayOfYear() {
  const now   = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now - start) / (1000 * 60 * 60 * 24));
}

function getTodayPostType() {
  return POST_TYPES[getDayOfYear() % POST_TYPES.length];
}

function getTodaySubcategory() {
  return SUBCATEGORIES[getDayOfYear() % SUBCATEGORIES.length];
}

// ─── Cache ────────────────────────────────────────────────────────────────────

function loadCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')); }
  catch { return {}; }
}

function saveCache(cache) {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

function sanitizeText(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^\d+\.\s+/, '')
    .trim();
}

// Enforces stat-carousel sentence rules: max 10 words, ends with a period.
// Truncates at last word boundary if too long, appends '.' if missing terminal punctuation.
function enforceStatSentence(text) {
  if (!text) return text;
  const words = String(text).trim().split(/\s+/);
  const capped = words.slice(0, 10).join(' ');
  // Strip trailing comma, colon, em-dash before checking for sentence end
  const cleaned = capped.replace(/[,:\u2014\u2013]+$/, '').trim();
  return /[.?!]$/.test(cleaned) ? cleaned : cleaned + '.';
}

// ─── GPT generation ───────────────────────────────────────────────────────────

async function generateSlidesFromGPT(post_type, subcategory) {
  const config = TYPE_CONFIG[post_type];
  const prompt = config.buildPrompt(subcategory);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are an expert in modern AI productivity tools as of 2025-2026. Current relevant tools include: ChatGPT, Claude, Perplexity, Notion AI, Cursor, Midjourney, ElevenLabs, Kling AI, Gamma, Descript, Make.com, Zapier, and other cutting-edge tools. Do not recommend outdated tools.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
  });

  const raw     = response.choices[0].message.content.trim();
  const jsonStr = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  const parsed  = JSON.parse(jsonStr);

  if (post_type === 'copy-paste-prompts' || post_type === 'how-to-guide') {
    // GPT now returns { title, body } objects for these types
    return parsed.map(s => ({
      title: sanitizeText(typeof s === 'string' ? s : (s.title || String(s))),
      body:  s.body ? sanitizeText(s.body) : null,
    }));
  }
  if (post_type === 'stat-carousel') {
    // Enforce: complete sentence, max 10 words, ends with period
    return parsed.map(s => ({
      stat:   enforceStatSentence(sanitizeText(s.stat || '')),
      source: s.source || '',
    }));
  }
  return parsed; // objects for tool-spotlight
}

// ─── Slide normalizer — maps per-type GPT output to renderer's { primary, secondary, label } ───
function normalizeSlide(slide, postType, carouselLabel) {
  switch (postType) {
    case 'tool-spotlight':
      return {
        primary:   `${slide.tool_name} — ${slide.one_liner}`,
        secondary: slide.wow_factor || null,
        label:     carouselLabel,
      };
    case 'how-to-guide':
    case 'copy-paste-prompts':
      return {
        primary:   slide.title,
        secondary: slide.body || null,
        label:     carouselLabel,
      };
    case 'stat-carousel':
      return {
        primary:   slide.stat,
        secondary: `Source: ${slide.source}`,
        label:     carouselLabel,
      };
    default:
      return {
        primary:   slide.primary || slide.text || slide.title || String(slide),
        secondary: slide.secondary || slide.body || null,
        label:     carouselLabel,
      };
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

async function generateResourceCarousel() {
  const today      = getToday();
  const post_type  = getTodayPostType();
  const subcategory = getTodaySubcategory();

  const cache = loadCache();
  const cached = cache[today];
  // Validate cache has new format (post_type field); discard old array-based entries
  let content;
  if (cached && !Array.isArray(cached) && cached.post_type) {
    console.log(`[resource-generator] Using cached content for ${today} (${cached.post_type})`);
    content = cached;
  } else {
    console.log(`[resource-generator] Generating ${post_type} for subcategory: ${subcategory}`);
    const config = TYPE_CONFIG[post_type];
    const slides = await generateSlidesFromGPT(post_type, subcategory);
    content = {
      post_type,
      hook_text:   config.hook,
      slides,
      caption_cta: config.cta,
    };
    cache[today] = content;
    saveCache(cache);
  }

  // Render carousel images and save to output/ (always — even on cache hit)
  try {
    const folder         = getOutputFolder('resource', content.hook_text);
    const carouselLabel  = content.post_type === 'tool-spotlight' ? 'TOOL SPOTLIGHT' : 'HOW TO GUIDE';
    const normalizedSlides = (content.slides || []).map(s => normalizeSlide(s, content.post_type, carouselLabel));
    const paths  = await renderResourceCarousel({ ...content, slides: normalizedSlides }, folder);
    console.log('[resource-generator] Saved 7 carousel files:');
    paths.forEach(p => console.log(`  - ${p}`));
    return { ...content, paths };
  } catch (err) {
    console.error('[resource-generator] Failed to render carousel:', err.message);
    return content;
  }
}

module.exports = { generateResourceCarousel };

// ─── Direct test ──────────────────────────────────────────────────────────────
if (require.main === module) {
  generateResourceCarousel()
    .then(result => {
      console.log('[resource-generator] post_type:', result.post_type);
      console.log('[resource-generator] hook_text:', result.hook_text);
      console.log('[resource-generator] slides:', JSON.stringify(result.slides, null, 2));
      console.log('[resource-generator] caption_cta:', result.caption_cta);
    })
    .catch(err => {
      console.error('[resource-generator] Error:', err);
      process.exit(1);
    });
}
