require('dotenv').config();
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const { withRetry } = require('./retry');
const { logError } = require('./logger');

// ============================================
// TOKEN USAGE CONFIGURATION
// ============================================
const DAILY_TOKEN_LIMIT = 100000;
// ============================================

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const LOGS_DIR = path.join(__dirname, '..', 'logs');
const TOKEN_USAGE_FILE = path.join(LOGS_DIR, 'token-usage.json');

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function getTodayDate() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

function loadTokenUsage() {
  ensureLogsDir();
  try {
    if (fs.existsSync(TOKEN_USAGE_FILE)) {
      const data = JSON.parse(fs.readFileSync(TOKEN_USAGE_FILE, 'utf8'));
      // Reset if it's a new day
      if (data.date !== getTodayDate()) {
        return { date: getTodayDate(), tokens: 0 };
      }
      return data;
    }
  } catch (err) {
    console.error('[Tokens] Failed to load token usage file:', err.message);
  }
  return { date: getTodayDate(), tokens: 0 };
}

function saveTokenUsage(usage) {
  ensureLogsDir();
  try {
    fs.writeFileSync(TOKEN_USAGE_FILE, JSON.stringify(usage, null, 2));
  } catch (err) {
    console.error('[Tokens] Failed to save token usage file:', err.message);
  }
}

function formatNumber(num) {
  return num.toLocaleString('en-US');
}

function checkTokenLimit() {
  const usage = loadTokenUsage();
  if (usage.tokens >= DAILY_TOKEN_LIMIT) {
    return { allowed: false, usage };
  }
  return { allowed: true, usage };
}

function recordTokenUsage(tokensUsed) {
  const usage = loadTokenUsage();
  usage.tokens += tokensUsed;
  usage.date = getTodayDate(); // Ensure date is current
  saveTokenUsage(usage);
  console.log(`[Tokens] Used: ${formatNumber(usage.tokens)} / ${formatNumber(DAILY_TOKEN_LIMIT)} today`);
  return usage;
}

function sanitizeText(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')   // remove **bold**
    .replace(/\*(.*?)\*/g, '$1')        // remove *italic*
    .replace(/^\d+\.\s+/, '')           // remove leading "1. " numbering
    .trim();
}

class TokenLimitExceededError extends Error {
  constructor(currentUsage) {
    super(`Daily token limit of ${formatNumber(DAILY_TOKEN_LIMIT)} reached. Current usage: ${formatNumber(currentUsage)}`);
    this.name = 'TokenLimitExceededError';
    this.currentUsage = currentUsage;
  }
}

const PROMPTS = {
  quote: (niche) => `You are a copywriter for a viral AI Instagram page.
Write ONE punchy quote about AI or technology.

Randomly select one of these two tones:

PROVOCATIVE (challenge the reader — use 50% of time):
Examples of the right energy:
'Your competitor is already using AI. Are you still Googling?'
'The robots aren't coming for your job. Your coworker who uses AI already took it.'
'Comfort is expensive. AI is cheap. Pick one.'

INSPIRATIONAL (aspirational energy — use 50% of time):
Examples of the right energy:
'The best time to learn AI was yesterday. Second best is right now.'
'You don't need to understand AI. You need to use it.'
'Master AI or be mastered by those who did.'

Hard rules:
- Maximum 12 words total
- No statistics unless exact and from a named source
- No exclamation marks
- No hashtags
- Must create a feeling — not just convey information
- Someone scrolling at 11pm should stop on this

Return the quote as a plain string only. No quote marks, no preamble.`,

  carousel: (niche, topic) => `You are a breaking news editor for a viral AI Instagram page. Write 5 punchy fact slides.

Topic: "${topic}"

Rules:
- Each slide: ONE declarative statement of FACT
- Maximum 10 words per slide
- Write like a newspaper subheadline: specific, factual, no fluff
- Use real names, real numbers, real specifics
- Do NOT write questions
- Do NOT write vague filler — write the actual claim
- Escalate tension across the 5 slides:
  slide 1: the core shocking fact
  slide 2: the context that makes it bigger
  slide 3: who pushed back or who is affected
  slide 4: what's at stake or what happens next
  slide 5: the bigger picture implication
- No exclamation marks

Return as JSON array of 5 strings only.`,

  news_carousel: (niche, topic) => `You are a viral AI news carousel writer for Instagram. Your output will be rendered as a multi-slide carousel post.

Topic: "${topic}"

HEADLINE FORMULA (cover slide):
- Must name a real person OR company AND include a specific number OR consequence
- Maximum 12 words
- Must create urgency, fear, or disbelief — never neutral
- All caps
- Examples of correct format:
  "SALESFORCE CEO SAYS ENGINEERS NO LONGER REQUIRED AS AI TAKES OVER"
  "ORACLE HAS BEGUN MAJOR LAYOFFS — UP TO 30,000 JOBS COULD BE CUT"
  "HALF OF AI DATA CENTERS PLANNED FOR 2026 HAVE BEEN DELAYED OR SCRAPPED"
  "THIS GUY BUILT AN AI AGENT THAT APPLIED TO 700 JOBS AND ACTUALLY GOT HIRED"
- Examples of WRONG format (do not use):
  "OpenAI releases new model with improved capabilities"
  "AI is changing the way we work"
  "New developments in artificial intelligence"

SUBTITLE LINE (below headline on cover):
- 6-8 words max, smaller text, describes the hook angle
- Example: "The shift that changes everything this year"

INNER SLIDES (slides array, slides 2 through N-1):
Each slide is an object with three fields:
- "label": 1-3 word category tag in ALL CAPS (e.g. "BREAKING", "CONTEXT", "IMPACT", "WHAT'S NEXT", "BIG PICTURE")
- "primary": The main bold fact — maximum 10 words, declarative statement, specific numbers/names
- "secondary": 6-10 word supporting detail or consequence — expands on primary

Rules:
- Lead with the most alarming or surprising fact first
- Include specific numbers, names, dollar amounts wherever possible
- First inner slide should be the key fact that proves the headline
- Last inner slide should be a "why this matters" or forward-looking statement
- Provide 4 to 6 inner slides
- No exclamation marks

CAPTION:
- 4-5 short paragraphs
- Start immediately with the news — no fluff opener
- Each paragraph is 1-3 sentences, punchy
- End with: "Follow us (@cuttingedgeofai) for everything latest from the AI world."
- Cite the source on the last line: "Source: [Publication]"
- No hashtag spam — max 3 relevant hashtags appended at the very end

NAMED PERSON for photo sourcing:
- Output a "photo_subject" field with the full name of the primary person in the story
- If no named person, output the company name instead
- This will be used to fetch a press photo
- Example: "photo_subject": "Sam Altman" or "photo_subject": "OpenAI"

SOURCE INFO:
- "source_name": the outlet name where this story originated (e.g. "TechCrunch", "Bloomberg", "r/ClaudeAI")
- "source_headline": the actual article or post title, max 15 words, verbatim or close paraphrase

Return ONLY valid JSON. No markdown, no code fences, no commentary:

{
  "headline": "ALL CAPS HEADLINE MAX 12 WORDS",
  "subtitle": "6-8 word subtitle describing hook angle",
  "photo_subject": "Full Name or Company",
  "source_name": "TechCrunch",
  "source_headline": "Original article title, max 15 words",
  "slides": [
    { "label": "BREAKING", "primary": "Key fact proving headline. Max 10 words.", "secondary": "Supporting detail or consequence, 6-10 words." },
    { "label": "CONTEXT", "primary": "Background that makes it bigger. Max 10 words.", "secondary": "Who or what is affected, 6-10 words." },
    { "label": "IMPACT", "primary": "Who is affected and how. Max 10 words.", "secondary": "Scale or consequence, 6-10 words." },
    { "label": "WHAT'S NEXT", "primary": "Forward-looking implication. Max 10 words.", "secondary": "Why this matters now, 6-10 words." }
  ],
  "caption": "Full Instagram caption text with paragraphs separated by newlines. End with follow instruction and source.",
  "cta_keyword": "BREAKING"
}`,

  viral_demo: (niche, postContent) => `You are writing a single-image Instagram post about a wild or surprising AI moment. This is NOT a carousel — it is one bold cover image with a caption.

Post content: "${postContent}"

This post type covers:
- Someone using AI to do something unexpected or impressive (built a tool, automated a task, got a crazy result)
- A before/after AI capability comparison
- A weird AI behavior or jailbreak that went viral
- An AI doing something physical in the real world (robot, Tesla, etc.)

HEADLINE FORMULA:
- Storytelling angle, not news angle
- Written like "THIS GUY..." or "SOMEONE MADE A..." or "AI JUST..."
- Maximum 10 words, all caps
- Must make someone stop scrolling
- Examples:
  "THIS GUY MADE CLAUDE TALK LIKE A CAVEMAN"
  "SOMEONE MADE A DIGITAL WHIP TO MAKE CLAUDE WORK FASTER"
  "TESLA AI AVOIDS CRASH WITH AN OVERTURNED TRUCK IN ZERO VISIBILITY"
  "AI JUST REBUILT MICROSOFT CLIPPY AS A CLAUDE CODE COMPANION"

SUBTITLE: 6-8 words describing what to expect inside

CAPTION:
- Conversational, excited tone
- Tell the story in 4 paragraphs
- End with "What are your thoughts on this? 🤯🤖"
- Then: "Follow us (@cuttingedgeofai) for everything latest from the AI world."
- Source cited

IMAGE DIRECTION:
- If the post is about a named real person (CEO, researcher, public figure), output their full name in "person_name" (e.g. "Sam Altman", "Elon Musk"). Otherwise leave "person_name" as null.
- "source_name": the subreddit (e.g. "r/ChatGPT") or site where this story came from
- "source_headline": the original post or article title, max 15 words
- Output a "visual_description" field describing what the cover image should look like as a fallback.

Return ONLY valid JSON. No markdown, no code fences:

{
  "headline": "ALL CAPS HEADLINE MAX 10 WORDS",
  "subtitle": "6-8 word subtitle",
  "person_name": "Full Name or null",
  "visual_description": "specific description of the cover image to fetch",
  "source_name": "r/ChatGPT",
  "source_headline": "Original post title, max 15 words",
  "caption": "Full Instagram caption with paragraphs separated by newlines.",
  "post_type": "single_image"
}`,

  caption: (niche, postText) => `Write an Instagram caption for a viral AI page. Voice: confident AI insider who knows things before everyone else. Not a teacher. Not a motivational speaker. Someone in the room where it happens.

Post content: "${postText}"

Structure:
- Line 1: A one-line hook that reframes the post from a different angle — not a summary, a new angle
- Lines 2-3: One piece of proof, context, or insider detail that makes this feel like inside knowledge
- Final line: A polarizing opinion or question that has a strong answer — something people will comment to agree or disagree with

Rules:
- Never say "comment below", "drop a like", "save this"
- Never use filler phrases
- Sound like a person not a brand
- Use exactly these 5 hashtags, no others: #AITools #ArtificialIntelligence #AIProductivity #FutureOfAI #AINews

Return JSON only:
{"caption": "text", "hashtags": ["AITools", "ArtificialIntelligence", "AIProductivity", "FutureOfAI", "AINews"]}`,

  reel: (niche) => `Write a 6-frame text Reel script for a viral AI Instagram page modeled after @evolving.ai.

Goal: Someone watches it twice because they feel like they missed something the first time.

Frame 1: A shocking or counterintuitive statement about AI that stops the scroll — max 8 words
Frame 2: The context that makes it more shocking
Frame 3: The thing most people don't know
Frame 4: The implication — why this changes everything
Frame 5: The specific action or tool that matters
Frame 6: The punchline or twist that reframes everything

Rules:
- Each frame max 8 words
- Each frame must feel incomplete without the next one
- Must reference a real AI tool, company or event
- Return JSON only:
{"frames": ["f1","f2","f3","f4","f5","f6"]}`
};

async function callOpenAI(type, niche, topic, options = {}) {
  // Check token limit before making the call
  const { allowed, usage } = checkTokenLimit();
  if (!allowed) {
    console.warn(`[Tokens] WARNING: Daily limit reached (${formatNumber(usage.tokens)} / ${formatNumber(DAILY_TOKEN_LIMIT)}). Skipping GPT call.`);
    throw new TokenLimitExceededError(usage.tokens);
  }

  return withRetry(async () => {
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: PROMPTS[type](niche, topic) }],
      temperature: 0.85,
    });

    // Track token usage
    const tokensUsed = (res.usage?.prompt_tokens || 0) + (res.usage?.completion_tokens || 0);
    if (tokensUsed > 0) {
      recordTokenUsage(tokensUsed);
    }

    return res.choices[0].message.content.trim();
  }, { label: 'OpenAI', ...options });
}

function sanitizeSlides(type, data) {
  if (type === 'quote') return sanitizeText(data);
  if (type === 'carousel') {
    // New format: array of 5 strings
    if (Array.isArray(data)) return data.map(sanitizeText);
    // Legacy format
    if (data.hook)   data.hook   = sanitizeText(data.hook);
    if (data.payoff) data.payoff = sanitizeText(data.payoff);
    if (data.cta)    data.cta    = sanitizeText(data.cta);
    if (Array.isArray(data.slides)) data.slides = data.slides.map(sanitizeText);
  }
  if (type === 'reel') {
    if (Array.isArray(data.frames)) data.frames = data.frames.map(sanitizeText);
  }
  return data;
}

async function generateContent(type, niche, topic = '', options = {}) {
  let raw = await callOpenAI(type, niche, topic, options);

  if (type === 'quote') return sanitizeText(raw);

  function stripFences(s) {
    return s.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  }

  // Try to parse JSON, retry once if it fails
  try {
    return sanitizeSlides(type, JSON.parse(stripFences(raw)));
  } catch (parseError) {
    console.error('[generateContent] JSON parse failed, raw output:', raw);
    logError({
      page: options.page || 'system',
      slot: options.slot || '-',
      error: new Error(`JSON parse failed: ${parseError.message}. Raw: ${raw.substring(0, 200)}`)
    });

    // Retry the GPT call once
    console.log('[generateContent] Retrying GPT call for valid JSON...');
    raw = await callOpenAI(type, niche, topic, options);

    try {
      return sanitizeSlides(type, JSON.parse(stripFences(raw)));
    } catch (retryParseError) {
      console.error('[generateContent] JSON parse failed on retry, raw output:', raw);
      throw new Error(`Failed to get valid JSON after retry. Raw: ${raw.substring(0, 200)}`);
    }
  }
}

module.exports = { generateContent, TokenLimitExceededError, DAILY_TOKEN_LIMIT };
