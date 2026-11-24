// scripts/promote-learnings.js
// Weekly script: promotes confirmed research findings to SOUL.md.
// Transition rules live in ./learning-lifecycle.js (see STATE_MACHINES.md).
// Runs on cron via PM2: 9am every Sunday.

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── Paths ────────────────────────────────────────────────────────────────────

const ROOT      = path.join(__dirname, '..');
const LEARNINGS = path.join(ROOT, 'memory', 'new_learnings.md');
const SOUL_PATH = path.join(ROOT, 'SOUL.md');

const {
  LEARNING_STATUS,
  parseEntries,
  nextLearningStatus,
} = require('./learning-lifecycle');

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(LEARNINGS)) {
    console.log('No new_learnings.md found — nothing to promote.');
    return;
  }

  const raw     = fs.readFileSync(LEARNINGS, 'utf8');
  const entries = parseEntries(raw);

  // Confirmation cross-check uses the statuses as read at the start of the run.
  const stagedEntries = entries.filter(e => e.status === LEARNING_STATUS.STAGED);

  // Per-block replacement so entries with identical text don't clobber each other.
  let outputContent = raw;
  const promotedEntries = [];
  const now = Date.now();

  for (const entry of entries) {
    const next = nextLearningStatus(entry, stagedEntries, now);
    if (next === entry.status) continue;

    outputContent = outputContent.replace(
      entry.raw,
      entry.raw.replace(`**Status:** ${entry.status}`, `**Status:** ${next}`)
    );
    if (next === LEARNING_STATUS.PROMOTED) promotedEntries.push(entry);
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
  const finalPromoted = finalEntries.filter(e => e.status === LEARNING_STATUS.PROMOTED).length;
  const finalExpired  = finalEntries.filter(e => e.status === LEARNING_STATUS.EXPIRED).length;
  const finalStaged   = finalEntries.filter(e => e.status === LEARNING_STATUS.STAGED).length;

  console.log(
    `Promote run complete: ${finalPromoted} promoted, ${finalExpired} expired, ${finalStaged} still staged`
  );
}

main();
