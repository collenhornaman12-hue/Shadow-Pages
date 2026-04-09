'use strict';
// scripts/seed-bank-generator.js
// Generates 30 content seeds monthly using AUDIENCE_PSYCHOLOGY_AI.md + live AI headlines.
// Primary context: TechCrunch / Verge / Wired RSS (past 30 days).
// Fallback 1: Reddit r/artificial, r/ChatGPT, r/ClaudeAI top posts (past month).
// Fallback 2: memory/new_learnings.md entries written by research-scout.
// Output: memory/seed-bank.json — array of seed objects ready for the orchestrator.
// Runs monthly via PM2 cron: 2am on the 1st.

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const OpenAI  = require('openai');
const Parser  = require('rss-parser');

// ── Paths ──────────────────────────────────────────────────────────────────────
const ROOT          = path.join(__dirname, '..');
const MEMORY_DIR    = path.join(ROOT, 'memory');
const PSYCH_FILE    = path.join(MEMORY_DIR, 'AUDIENCE_PSYCHOLOGY_AI.md');
const SEED_FILE     = path.join(MEMORY_DIR, 'seed-bank.json');
const STORIES_FILE  = path.join(MEMORY_DIR, 'posted-stories.json');
const LEARNINGS_FILE = path.join(MEMORY_DIR, 'new_learnings.md');

// ── Config ─────────────────────────────────────────────────────────────────────
const CONTEXT_FEEDS = [
  'https://techcrunch.com/category/artificial-intelligence/feed/',
  'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
  'https://www.wired.com/feed/tag/ai/latest/rss',
];

const FALLBACK_SUBREDDITS = ['artificial', 'ChatGPT', 'ClaudeAI', 'MachineLearning'];

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── News context fetching ──────────────────────────────────────────────────────

async function fetchRssHeadlines() {
  const parser   = new Parser();
  const headlines = [];
  const cutoff   = Date.now() - THIRTY_DAYS_MS;

  for (const feedUrl of CONTEXT_FEEDS) {
    try {
      const feed = await parser.parseURL(feedUrl);
      for (const item of (feed.items || []).slice(0, 15)) {
        const pubMs = item.pubDate ? new Date(item.pubDate).getTime() : Date.now();
        if (pubMs >= cutoff) {
          headlines.push({
            title:  (item.title || '').trim(),
            source: feed.title || new URL(feedUrl).hostname,
          });
        }
      }
    } catch (err) {
      console.warn(`[seed-bank] RSS failed (${new URL(feedUrl).hostname}): ${err.message}`);
    }
  }

  return headlines;
}

// Fallback 1: Reddit top posts from AI subreddits (past month).
async function fetchRedditHeadlines() {
  const headlines = [];
  for (const sub of FALLBACK_SUBREDDITS) {
    try {
      const url = `https://www.reddit.com/r/${sub}/top.json?limit=10&t=month`;
      const res = await fetch(url, { headers: { 'User-Agent': 'shadow-pages-seed-bot/1.0' } });
      if (!res.ok) continue;
      const data = await res.json();
      for (const { data: p } of (data?.data?.children || [])) {
        if (p.score >= 200) {
          headlines.push({ title: p.title.trim(), source: `r/${sub}` });
        }
      }
    } catch (err) {
      console.warn(`[seed-bank] Reddit fallback failed (r/${sub}): ${err.message}`);
    }
  }
  return headlines;
}

// Fallback 2: Parse titles out of memory/new_learnings.md written by research-scout.
function fetchLearningsHeadlines() {
  const headlines = [];
  try {
    if (!fs.existsSync(LEARNINGS_FILE)) return headlines;
    const text = fs.readFileSync(LEARNINGS_FILE, 'utf8');
    // Each entry has "**Finding:** <title>" line
    const matches = text.matchAll(/\*\*Finding:\*\*\s*(.+)/g);
    for (const m of matches) {
      const title = m[1].trim().replace(/…$/, '');
      if (title) headlines.push({ title, source: 'research-scout' });
    }
  } catch (err) {
    console.warn(`[seed-bank] Learnings fallback failed: ${err.message}`);
  }
  return headlines.slice(0, 20);
}

// ── Context block builder ──────────────────────────────────────────────────────

async function buildContextBlock() {
  let headlines = await fetchRssHeadlines();

  if (headlines.length < 5) {
    console.warn(`[seed-bank] RSS thin (${headlines.length}) — trying Reddit fallback...`);
    const reddit = await fetchRedditHeadlines();
    headlines = [...headlines, ...reddit];
  }

  if (headlines.length < 5) {
    console.warn(`[seed-bank] Reddit thin (${headlines.length}) — using research-scout learnings...`);
    const learnings = fetchLearningsHeadlines();
    headlines = [...headlines, ...learnings];
  }

  const now   = new Date();
  const month = now.toLocaleString('en-US', { month: 'long' });
  const year  = now.getFullYear();

  const headlineText = headlines.length > 0
    ? headlines.slice(0, 25).map((h, i) => `${i + 1}. "${h.title}" — ${h.source}`).join('\n')
    : '(no live headlines available — generate evergreen seeds and flag each with [EVERGREEN])';

  console.log(`[seed-bank] Context: ${headlines.length} headlines collected`);

  return `[CURRENT_MONTH_CONTEXT]
Month: ${month} ${year}
Major AI headlines from the past 30 days:
${headlineText}
[/CURRENT_MONTH_CONTEXT]`;
}

// ── Posted-stories dedup ───────────────────────────────────────────────────────

function loadPostedKeys() {
  try {
    if (!fs.existsSync(STORIES_FILE)) return [];
    const data = JSON.parse(fs.readFileSync(STORIES_FILE, 'utf8'));
    if (!Array.isArray(data)) return [];
    return data
      .map(s => (typeof s === 'string' ? s : s.key || s.title || ''))
      .filter(Boolean)
      .slice(-40); // last 40 keys
  } catch (_) {
    return [];
  }
}

// ── GPT call ───────────────────────────────────────────────────────────────────

async function callGpt(psychDoc, contextBlock, postedKeys) {
  const postedSection = postedKeys.length > 0
    ? `\n\n---\n## RECENTLY POSTED — DO NOT REPEAT THESE TOPICS\n${postedKeys.join('\n')}\n---`
    : '';

  // The psych doc already contains all GPT instructions.
  // We prepend the context block and append the dedup list.
  const prompt = `${contextBlock}\n\n${psychDoc}${postedSection}`;

  const res = await client.chat.completions.create({
    model:       'gpt-4o-mini',
    messages:    [{ role: 'user', content: prompt }],
    temperature: 0.85,
    max_tokens:  3500,
  });

  const tokensUsed = (res.usage?.prompt_tokens || 0) + (res.usage?.completion_tokens || 0);
  console.log(`[seed-bank] GPT tokens used: ${tokensUsed}`);

  return res.choices[0].message.content.trim();
}

// ── Seed parser ────────────────────────────────────────────────────────────────
// Parses lines like: "1. [Category] | [Hook] | [Keyword]"

function parseSeeds(raw) {
  const seeds = [];
  const lines = raw.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!/^\d+\./.test(trimmed)) continue;

    const withoutNum = trimmed.replace(/^\d+\.\s*/, '');
    const parts = withoutNum.split('|').map(p => p.trim());
    if (parts.length < 2 || !parts[1]) continue;

    seeds.push({
      id:           seeds.length + 1,
      category:     parts[0] || 'Unknown',
      hook:         parts[1] || '',
      keyword:      (parts[2] || 'NONE').replace(/^NONE$/i, 'NONE'),
      generated_at: new Date().toISOString().split('T')[0],
      used:         false,
    });
  }

  return seeds;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function run() {
  console.log('[seed-bank] Starting monthly seed generation...');

  if (!fs.existsSync(PSYCH_FILE)) {
    throw new Error(`[seed-bank] AUDIENCE_PSYCHOLOGY_AI.md not found at: ${PSYCH_FILE}`);
  }
  const psychDoc = fs.readFileSync(PSYCH_FILE, 'utf8');

  const contextBlock = await buildContextBlock();
  const postedKeys   = loadPostedKeys();
  console.log(`[seed-bank] Dedup: ${postedKeys.length} posted stories loaded`);

  const raw   = await callGpt(psychDoc, contextBlock, postedKeys);
  const seeds = parseSeeds(raw);

  if (seeds.length === 0) {
    throw new Error('[seed-bank] GPT returned 0 parseable seeds. Raw output:\n' + raw.slice(0, 500));
  }

  if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
  fs.writeFileSync(SEED_FILE, JSON.stringify(seeds, null, 2));
  console.log(`[seed-bank] ${seeds.length} seeds saved → ${SEED_FILE}`);

  return seeds;
}

module.exports = { run };

// ── Direct execution ───────────────────────────────────────────────────────────
if (require.main === module) {
  run()
    .then(seeds => {
      console.log(`\n[seed-bank] Done. ${seeds.length} seeds generated:\n`);
      for (const s of seeds) {
        console.log(`  ${String(s.id).padStart(2)}. [${s.category}] ${s.hook} | ${s.keyword}`);
      }
    })
    .catch(err => {
      console.error('[seed-bank] Fatal:', err.message);
      process.exit(1);
    });
}
