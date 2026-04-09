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
const FILTER_LOG    = path.join(MEMORY_DIR, 'seed-filter-log.txt');

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

const SYSTEM_PROMPT =
  'You are a sharp, opinionated content strategist for @CuttingEdgeOfAI, an Instagram ' +
  'account in the AI and productivity niche. Your job is to generate seed topics that stop ' +
  'the scroll, speak to professionals who are aware of AI but haven\'t fully acted on it, ' +
  'and feel like insider intelligence — not press releases. You have high standards. Vague ' +
  'seeds get discarded. Generic hooks get rewritten. Every seed must have a specific ' +
  'surprising element that justifies stopping the scroll.';

// Extracts a ## section up to the next ## heading or end of document.
function extractH2(doc, heading) {
  const re = new RegExp(`## ${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?(?=\\n## |$)`);
  const m  = doc.match(re);
  return m ? m[0].trim() : '';
}

// Extracts a ### subsection up to the next ### or ## heading or end of document.
function extractH3(doc, heading) {
  const re = new RegExp(`### ${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?(?=\\n### |\\n## |$)`);
  const m  = doc.match(re);
  return m ? m[0].trim() : '';
}

// Extracts just the current month's row from the AI Content Calendar table.
function extractCurrentMonthGuidance(doc) {
  const month = new Date().toLocaleString('en-US', { month: 'long' });
  for (const line of doc.split('\n')) {
    if (line.includes('|') && line.toLowerCase().includes(month.toLowerCase())) {
      return `${month} seasonal guidance: ${line.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim()}`;
    }
  }
  return '';
}

// Extracts the "Natural keyword fits by category" bullet list from Monetization section.
function extractKeywordMap(doc) {
  const m = doc.match(/Natural keyword fits by category[\s\S]*?(?=\n---|\n## |$)/);
  return m ? m[0].trim() : '';
}

// Assembles Section 2 from specific psychDoc extracts only — not the full doc.
function buildCreativeConstraints(psychDoc) {
  return [
    extractH2(psychDoc,  'The Core Tension (Most Important Section)'),
    extractH3(psychDoc,  '5. The Scroll-Stop Trigger'),
    extractH2(psychDoc,  'Contrarian Content — Defined for This Niche'),
    extractH3(psychDoc,  'Cover / Caption Voice'),
    extractH2(psychDoc,  'Seed Bank Content Categories'),
    extractCurrentMonthGuidance(psychDoc),
    extractH2(psychDoc,  'Banned Content Directions'),
    extractKeywordMap(psychDoc),
  ].filter(Boolean).join('\n\n---\n\n');
}

const GENERATION_INSTRUCTION =
  'Generate exactly 30 seeds now. Apply every rule above without exception. ' +
  'If a seed fails the hook-first rule, rewrite it before including it. ' +
  'If a seed fails the anchor test, discard it and generate a replacement. ' +
  'If you cannot produce a true contrarian seed with a specific target this month, ' +
  'reallocate those slots to Insider or Breaking News — do not generate fake contrarian ' +
  'seeds to hit a number.\n\n' +
  'Required format for every seed:\n' +
  '[Category] | [Hook-first topic sentence, max 12 words] | [Keyword]\n\n' +
  'Banned endings: never end a seed with "here\'s why", "here\'s how", "don\'t miss it", ' +
  '"find out why", "which wins?", "a new era", or any question mark. The seed must state ' +
  'a position or consequence, not tease one.\n\n' +
  'Comparison seeds must declare a winner or a specific advantage — not pose a question. ' +
  'Bad: "Claude vs GPT-4o — which is better?" Good: "Claude wins on long-document tasks ' +
  '— GPT-4o still leads on speed."\n\n' +
  'Output the 30 seeds and nothing else. No preamble. No explanation. No commentary after.';

async function callGpt(psychDoc, contextBlock, postedKeys) {
  const postedSection = postedKeys.length > 0
    ? `RECENTLY POSTED — DO NOT REPEAT THESE TOPICS:\n${postedKeys.join('\n')}`
    : '';

  const userPrompt = [
    contextBlock,
    '---\n## CREATIVE CONSTRAINTS\n\n' + buildCreativeConstraints(psychDoc),
    ...(postedSection ? [postedSection] : []),
    '---\n' + GENERATION_INSTRUCTION,
  ].join('\n\n');

  const res = await client.chat.completions.create({
    model:       'gpt-4o-mini',
    messages:    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: userPrompt },
    ],
    temperature: 0.9,
    max_tokens:  3500,
  });

  const tokensUsed = (res.usage?.prompt_tokens || 0) + (res.usage?.completion_tokens || 0);
  console.log(`[seed-bank] GPT tokens used: ${tokensUsed}`);

  return res.choices[0].message.content.trim();
}

// ── Seed quality filter ────────────────────────────────────────────────────────

const BANNED_PATTERNS = [
  "here's why",
  "here's how",
  "game-changing",
  "effortlessly",
  "you need to know",
  "will change everything",
  "the future is here",
  "in today's world",
  "in the age of ai",
  "leverage",
];

function isValidSeed(seed) {
  if (!seed || typeof seed.hook !== 'string' || !seed.hook.trim()) {
    return { valid: false, reason: 'parse failure' };
  }
  // Normalize curly/smart quotes to straight so patterns match GPT output
  const h = seed.hook.toLowerCase().replace(/[\u2018\u2019\u201A\u201B]/g, "'");
  for (const pattern of BANNED_PATTERNS) {
    if (h.includes(pattern)) {
      return { valid: false, reason: `contains "${pattern}"` };
    }
  }
  if (h.trimEnd().endsWith('?')) {
    return { valid: false, reason: 'ends with question mark' };
  }
  if (h.trimEnd().endsWith('...')) {
    return { valid: false, reason: 'ends with ellipsis' };
  }
  return { valid: true };
}

function filterSeeds(seeds) {
  const valid    = [];
  const rejected = [];
  for (const seed of seeds) {
    const result = isValidSeed(seed);
    if (result.valid) {
      valid.push(seed);
    } else {
      const hook   = seed?.hook || '(no hook)';
      const reason = result.reason;
      rejected.push({ hook, reason });
      const ts   = new Date().toISOString().replace('T', ' ').slice(0, 16);
      const line = `[${ts}] REJECTED: "${hook}" — reason: ${reason}`;
      console.log(line);
      try {
        fs.appendFileSync(FILTER_LOG, line + '\n');
      } catch (err) {
        console.warn(`[seed-filter] Failed to write filter log: ${err.message}`);
      }
    }
  }
  return { valid, rejected };
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
      category:     (parts[0] || 'Unknown').replace(/\*\*/g, '').replace(/^\[+|\]+$/g, '').trim(),
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
  let   seeds = parseSeeds(raw);

  if (seeds.length === 0) {
    throw new Error('[seed-bank] GPT returned 0 parseable seeds. Raw output:\n' + raw.slice(0, 500));
  }

  const realSeedCount = seeds.length;

  // Filter validation: inject known-bad seed to confirm filter is working
  const TEST_BAD_SEED = { hook: 'Here is how leverage will change everything effortlessly' };
  seeds.push(TEST_BAD_SEED);

  const { valid, rejected } = filterSeeds(seeds);

  const testRejected = rejected.some(r => r.hook === TEST_BAD_SEED.hook);
  if (!testRejected) {
    console.warn('[seed-filter] WARNING: test bad seed was NOT rejected — check filter logic');
  } else {
    console.log('[seed-filter] Filter validation passed — test bad seed correctly rejected');
  }

  const realRejectedCount = rejected.length - (testRejected ? 1 : 0);

  if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
  fs.writeFileSync(SEED_FILE, JSON.stringify(valid, null, 2));
  console.log(`[seed-bank] wrote ${valid.length}/${realSeedCount} seeds (${realRejectedCount} rejected by filter)`);

  if (valid.length < 20) {
    console.log(`[seed-filter] WARNING: only ${valid.length} valid seeds written — review GPT prompt quality`);
  }

  return valid;
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
