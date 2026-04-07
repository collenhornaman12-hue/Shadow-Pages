// scripts/promote-learnings.js
// Weekly script: promotes confirmed research findings to SOUL.md.
// Runs on cron via PM2: 9am every Sunday.

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── Paths ────────────────────────────────────────────────────────────────────

const ROOT      = path.join(__dirname, '..');
const LEARNINGS = path.join(ROOT, 'memory', 'new_learnings.md');
const SOUL_PATH = path.join(ROOT, 'SOUL.md');

// ─── Keyword scoring list (same as scout) ─────────────────────────────────────

const KEYWORDS = [
  'instagram', 'reels', 'carousel', 'meta', 'graph api', 'apify',
  'n8n', 'automation', 'shadow page', 'monetization', 'stan store',
  'manychat', 'hook', 'engagement', 'algorithm', 'reach', 'ai content',
  'passive income', 'openai', 'gpt',
];

// ─── Entry parser ─────────────────────────────────────────────────────────────
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
      status:  statusMatch ? statusMatch[1].trim()   : 'staged',
      raw:     block,                  // kept for in-place replacement
    });
  }

  return entries;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function ageInDays(dateStr) {
  const parsed = new Date(dateStr.replace(' ', 'T'));
  const ms     = Date.now() - parsed.getTime();
  return ms / (1000 * 60 * 60 * 24);
}

function runDateOf(entry) {
  // The date field is "YYYY-MM-DD HH:mm" — the date portion is the run date
  return entry.date.slice(0, 10);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(LEARNINGS)) {
    console.log('No new_learnings.md found — nothing to promote.');
    return;
  }

  const raw     = fs.readFileSync(LEARNINGS, 'utf8');
  const entries = parseEntries(raw);

  let promoted = 0;
  let expired  = 0;
  let staged   = 0;

  // Work on a mutable copy of the file content for in-place status updates
  let updatedRaw = raw;

  // Collect all staged entries for confirmation cross-check
  const stagedEntries = entries.filter(e => e.status === 'staged');

  for (const entry of entries) {
    if (entry.status !== 'staged') continue;

    const age = ageInDays(entry.date);

    // Expire: 14+ days old, still staged
    if (age >= 14) {
      updatedRaw = updatedRaw.replace(
        /\*\*Status:\*\* staged/,
        '**Status:** expired'
      );
      // Ensure we only replace the first matching occurrence per pass
      // by working off the raw block (simple approach: do targeted replace)
      // Re-anchor to the specific block
      updatedRaw = raw; // reset and do a targeted per-entry replacement below
      expired++;
      continue;
    }

    // Confirm: older than 7 days AND another staged entry from a different run date
    // shares same domain AND has 2+ overlapping keywords
    if (age >= 7) {
      const domain = extractDomain(entry.url);
      const myDate = runDateOf(entry);

      const confirmedBy = stagedEntries.find(other =>
        other !== entry &&
        runDateOf(other) !== myDate &&
        extractDomain(other.url) === domain &&
        overlappingKeywordCount(entry, other) >= 2
      );

      if (confirmedBy) {
        promoted++;
        continue; // marked for promotion below
      }
    }

    staged++;
  }

  // Redo the status updates cleanly with per-block replacement
  // to avoid clobbering multiple entries with the same text.
  let outputContent = raw;

  const promotedEntries = [];

  for (const entry of entries) {
    if (entry.status !== 'staged') continue;

    const age    = ageInDays(entry.date);
    const domain = extractDomain(entry.url);
    const myDate = runDateOf(entry);

    if (age >= 14) {
      // Expire
      outputContent = outputContent.replace(
        entry.raw,
        entry.raw.replace('**Status:** staged', '**Status:** expired')
      );
    } else if (age >= 7) {
      const confirmedBy = stagedEntries.find(other =>
        other !== entry &&
        runDateOf(other) !== myDate &&
        extractDomain(other.url) === domain &&
        overlappingKeywordCount(entry, other) >= 2
      );

      if (confirmedBy) {
        outputContent = outputContent.replace(
          entry.raw,
          entry.raw.replace('**Status:** staged', '**Status:** promoted')
        );
        promotedEntries.push(entry);
      }
    }
  }

  // Write updated learnings file
  fs.writeFileSync(LEARNINGS, outputContent, 'utf8');

  // Append promoted entries to SOUL.md under ## Research Learnings
  if (promotedEntries.length > 0) {
    let soul = fs.existsSync(SOUL_PATH) ? fs.readFileSync(SOUL_PATH, 'utf8') : '';

    if (!soul.includes('## Research Learnings')) {
      soul = soul.trimEnd() + '\n\n## Research Learnings\n';
    }

    for (const e of promotedEntries) {
      const line = `- [${e.date.slice(0, 10)}] ${e.finding}\n`;
      soul += line;
    }

    fs.writeFileSync(SOUL_PATH, soul, 'utf8');
  }

  // Recount actual final states for accurate reporting
  const finalRaw     = fs.readFileSync(LEARNINGS, 'utf8');
  const finalEntries = parseEntries(finalRaw);
  const finalPromoted = finalEntries.filter(e => e.status === 'promoted').length;
  const finalExpired  = finalEntries.filter(e => e.status === 'expired').length;
  const finalStaged   = finalEntries.filter(e => e.status === 'staged').length;

  console.log(
    `Promote run complete: ${finalPromoted} promoted, ${finalExpired} expired, ${finalStaged} still staged`
  );
}

main();
