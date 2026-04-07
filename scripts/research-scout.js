// scripts/research-scout.js
// Hunts Reddit and Hacker News for findings relevant to the Shadow Pages pipeline.
// Uses native fetch (Node 18+) only — no node-fetch import.
// Runs on cron via PM2: 1am, 3am, 5am daily.

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── Paths ────────────────────────────────────────────────────────────────────

const ROOT         = path.join(__dirname, '..');
const MEMORY_DIR   = path.join(ROOT, 'memory');
const LEARNINGS    = path.join(MEMORY_DIR, 'new_learnings.md');
const SOUL_PATH    = path.join(ROOT, 'SOUL.md');
const USER_PATH    = path.join(ROOT, 'USER.md');

// ─── Keyword scoring list ─────────────────────────────────────────────────────

const KEYWORDS = [
  'instagram', 'reels', 'carousel', 'meta', 'graph api', 'apify',
  'n8n', 'automation', 'shadow page', 'monetization', 'stan store',
  'manychat', 'hook', 'engagement', 'algorithm', 'reach', 'ai content',
  'passive income', 'openai', 'gpt',
];

// ─── Sources ──────────────────────────────────────────────────────────────────

const REDDIT_SUBREDDITS = [
  'InstagramMarketing',
  'entrepreneur',
  'AItools',
  'automation',
  'passive_income',
];

const HN_QUERIES = [
  'instagram+algorithm',
  'meta+api',
  'n8n+automation',
  'instagram+automation',
  'openai+content',
];

// ─── Utilities ────────────────────────────────────────────────────────────────

function scoreText(text) {
  const lower = text.toLowerCase();
  let score = 0;
  for (const kw of KEYWORDS) {
    if (lower.includes(kw)) score++;
  }
  return score;
}

function truncate(str, max) {
  if (!str) return '';
  return str.length <= max ? str : str.slice(0, max - 1) + '…';
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function loadContextWords() {
  let text = '';
  try { text += fs.readFileSync(SOUL_PATH, 'utf8') + ' '; } catch (_) {}
  try { text += fs.readFileSync(USER_PATH, 'utf8'); } catch (_) {}
  // Extract words of 3+ chars
  return new Set(
    text.toLowerCase().match(/\b[a-z]{3,}\b/g) || []
  );
}

function isRedundant(result, contextWords) {
  const titleWords = (result.title || '').toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
  const urlWords   = (result.url   || '').toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
  const allWords   = new Set([...titleWords, ...urlWords]);
  for (const w of allWords) {
    if (contextWords.has(w)) return true;
  }
  return false;
}

function formatDate(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function appendLearning({ source, url, title, score, status }) {
  const dateStr = formatDate(new Date());
  const entry = [
    `## [${dateStr}] — ${source}`,
    `**URL:** ${url}`,
    `**Finding:** ${truncate(title, 120)}`,
    `**Score:** ${score}`,
    `**Status:** ${status}`,
    '---',
    '',
  ].join('\n');
  fs.appendFileSync(LEARNINGS, entry, 'utf8');
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchRedditSubreddit(sub) {
  const url = `https://www.reddit.com/r/${sub}/new.json?limit=25`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'shadow-pages-scout/1.0' },
  });
  if (!res.ok) throw new Error(`Reddit ${sub}: HTTP ${res.status}`);
  const data = await res.json();
  const posts = data?.data?.children || [];
  return posts.map(child => {
    const p = child.data;
    return {
      source: `Reddit/r/${sub}`,
      title:  p.title || '',
      url:    p.url   || `https://reddit.com${p.permalink || ''}`,
      body:   truncate(p.selftext || '', 300),
    };
  });
}

async function fetchHN(query) {
  const url = `https://hn.algolia.com/api/v1/search_by_date?query=${query}&hitsPerPage=10`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HN query "${query}": HTTP ${res.status}`);
  const data = await res.json();
  const hits = data?.hits || [];
  return hits.map(h => {
    const hnUrl = h.story_url || `https://news.ycombinator.com/item?id=${h.objectID}`;
    return {
      source: 'HackerNews',
      title:  h.title || '',
      url:    hnUrl,
      body:   truncate(h.story_text || '', 300),
    };
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
  if (!fs.existsSync(LEARNINGS)) {
    fs.writeFileSync(LEARNINGS,
      '# Research Scout — New Learnings\n' +
      'Staged findings are promoted to SOUL.md weekly if confirmed by multiple runs.\n' +
      'Expired findings are older than 14 days with no confirmation.\n' +
      '---\n', 'utf8');
  }

  const contextWords = loadContextWords();
  const allResults   = [];
  let totalFetched   = 0;

  // Fetch Reddit
  for (const sub of REDDIT_SUBREDDITS) {
    try {
      const items = await fetchRedditSubreddit(sub);
      totalFetched += items.length;
      allResults.push(...items);
    } catch (err) {
      console.error(`[scout] Reddit/${sub} fetch failed:`, err.message);
    }
  }

  // Fetch Hacker News
  for (const q of HN_QUERIES) {
    try {
      const items = await fetchHN(q);
      totalFetched += items.length;
      allResults.push(...items);
    } catch (err) {
      console.error(`[scout] HN query "${q}" fetch failed:`, err.message);
    }
  }

  // Score all results
  const scored = allResults.map(r => ({
    ...r,
    score: scoreText(`${r.title} ${r.body} ${r.url}`),
  }));

  // Filter score < 2
  const passed = scored.filter(r => r.score >= 2);

  // Top 10 by score
  const top10 = passed
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  // Cross-reference against SOUL.md + USER.md
  let newCount       = 0;
  let redundantCount = 0;

  for (const result of top10) {
    const redundant = isRedundant(result, contextWords);
    if (redundant) {
      redundantCount++;
    } else {
      appendLearning({
        source: result.source,
        url:    result.url,
        title:  result.title,
        score:  result.score,
        status: 'staged',
      });
      newCount++;
    }
  }

  console.log(
    `Scout run complete: ${totalFetched} fetched, ${passed.length} passed filter, ` +
    `${newCount} new, ${redundantCount} redundant`
  );
}

main().catch(err => {
  console.error('[scout] Fatal error:', err.message);
  process.exit(1);
});
