// scripts/learning-lifecycle.js
// Pure rules for research-learning entries in memory/new_learnings.md
// (written by research-scout.js, advanced by promote-learnings.js).
// See STATE_MACHINES.md. Update both when you add a state.
//
//   staged ──(age ≥ 14d)──────────────────────────────▶ expired   (terminal)
//   staged ──(7d ≤ age < 14d AND confirmed)───────────▶ promoted  (terminal, appended to SOUL.md)
//   staged ──(otherwise)──────────────────────────────▶ staged

'use strict';

const LEARNING_STATUS = Object.freeze({
  STAGED:   'staged',
  PROMOTED: 'promoted',
  EXPIRED:  'expired',
});

const EXPIRE_AFTER_DAYS  = 14;
const CONFIRM_AFTER_DAYS = 7;
const MIN_SHARED_KEYWORDS = 2;

const KEYWORDS = [
  'instagram', 'reels', 'carousel', 'meta', 'graph api', 'apify',
  'n8n', 'automation', 'shadow page', 'monetization', 'stan store',
  'manychat', 'hook', 'engagement', 'algorithm', 'reach', 'ai content',
  'passive income', 'openai', 'gpt',
];

// Parses the markdown into structured objects.
function parseEntries(content) {
  const entries = [];
  // Split on the separator between entries
  const blocks = content.split(/\n---\n/).map(b => b.trim()).filter(Boolean);

  for (const block of blocks) {
    // Skip the file header block (no ## date line)
    if (!block.startsWith('## [')) continue;

    const dateMatch    = block.match(/^## \[(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\] — (.+)/m);
    const urlMatch     = block.match(/\*\*URL:\*\* (.+)/);
    const findingMatch = block.match(/\*\*Finding:\*\* (.+)/);
    const scoreMatch   = block.match(/\*\*Score:\*\* (\d+)/);
    const statusMatch  = block.match(/\*\*Status:\*\* (\w+)/);

    if (!dateMatch) continue;

    entries.push({
      date:    dateMatch[1],           // "YYYY-MM-DD HH:mm"
      source:  dateMatch[2].trim(),
      url:     urlMatch    ? urlMatch[1].trim()      : '',
      finding: findingMatch? findingMatch[1].trim()  : '',
      score:   scoreMatch  ? parseInt(scoreMatch[1]) : 0,
      status:  statusMatch ? statusMatch[1].trim()   : LEARNING_STATUS.STAGED,
      raw:     block,                  // kept for in-place replacement
    });
  }

  return entries;
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function entryKeywords(entry) {
  const text  = `${entry.finding} ${entry.url}`.toLowerCase();
  return KEYWORDS.filter(kw => text.includes(kw));
}

function overlappingKeywordCount(a, b) {
  const kwA = new Set(entryKeywords(a));
  return entryKeywords(b).filter(kw => kwA.has(kw)).length;
}

function ageInDays(dateStr, now = Date.now()) {
  const parsed = new Date(dateStr.replace(' ', 'T'));
  const ms     = now - parsed.getTime();
  return ms / (1000 * 60 * 60 * 24);
}

function runDateOf(entry) {
  // The date field is "YYYY-MM-DD HH:mm" — the date portion is the run date
  return entry.date.slice(0, 10);
}

// Another staged entry from a different run date, same domain, 2+ shared keywords.
function findConfirmation(entry, stagedEntries) {
  const domain = extractDomain(entry.url);
  const myDate = runDateOf(entry);
  return stagedEntries.find(other =>
    other !== entry &&
    runDateOf(other) !== myDate &&
    extractDomain(other.url) === domain &&
    overlappingKeywordCount(entry, other) >= MIN_SHARED_KEYWORDS
  );
}

// The one transition function. Non-staged entries are terminal and never change.
function nextLearningStatus(entry, stagedEntries, now = Date.now()) {
  if (entry.status !== LEARNING_STATUS.STAGED) return entry.status;

  const age = ageInDays(entry.date, now);
  if (age >= EXPIRE_AFTER_DAYS) return LEARNING_STATUS.EXPIRED;
  if (age >= CONFIRM_AFTER_DAYS && findConfirmation(entry, stagedEntries)) {
    return LEARNING_STATUS.PROMOTED;
  }
  return LEARNING_STATUS.STAGED;
}

module.exports = {
  LEARNING_STATUS,
  EXPIRE_AFTER_DAYS,
  CONFIRM_AFTER_DAYS,
  KEYWORDS,
  parseEntries,
  extractDomain,
  entryKeywords,
  overlappingKeywordCount,
  ageInDays,
  runDateOf,
  findConfirmation,
  nextLearningStatus,
};
