// Run with: npm test   (node --test, no extra deps, no network, no posting)
'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

const {
  CONTAINER_STATUS, containerStep,
  FORMATS, FORMAT_SCHEDULE, formatForSlot, preferredStoryIndex,
} = require('../modules/post-states');

const {
  LEARNING_STATUS, parseEntries, nextLearningStatus, ageInDays,
} = require('../scripts/learning-lifecycle');

// ── Instagram container polling ──────────────────────────────────────────────

test('containerStep: FINISHED is ready, ERROR fails, everything else keeps polling', () => {
  assert.equal(containerStep('FINISHED'), 'ready');
  assert.equal(containerStep('ERROR'), 'failed');
  for (const s of ['IN_PROGRESS', 'EXPIRED', 'PUBLISHED', undefined, null, '', 'finished']) {
    assert.equal(containerStep(s), 'wait', `status ${String(s)}`);
  }
});

test('CONTAINER_STATUS values match Graph API strings', () => {
  assert.deepEqual(Object.values(CONTAINER_STATUS).sort(),
    ['ERROR', 'EXPIRED', 'FINISHED', 'IN_PROGRESS', 'PUBLISHED']);
  assert.ok(Object.isFrozen(CONTAINER_STATUS));
});

// ── Slot → format routing ────────────────────────────────────────────────────

test('FORMAT_SCHEDULE keeps the live 4-slot rotation', () => {
  assert.deepEqual([...FORMAT_SCHEDULE],
    ['viral_demo', 'news-carousel', 'resource-carousel', 'news-carousel']);
  assert.ok(Object.isFrozen(FORMAT_SCHEDULE));
});

test('formatForSlot wraps by schedule length', () => {
  assert.equal(formatForSlot(0), FORMATS.VIRAL_DEMO);
  assert.equal(formatForSlot(1), FORMATS.NEWS_CAROUSEL);
  assert.equal(formatForSlot(2), FORMATS.RESOURCE_CAROUSEL);
  assert.equal(formatForSlot(3), FORMATS.NEWS_CAROUSEL);
  assert.equal(formatForSlot(4), FORMATS.VIRAL_DEMO);
  assert.equal(formatForSlot(7), FORMATS.NEWS_CAROUSEL);
});

test('preferredStoryIndex: slot 1 → story[0], every other slot → story[1]', () => {
  assert.equal(preferredStoryIndex(1), 0);
  assert.equal(preferredStoryIndex(5), 0);
  assert.equal(preferredStoryIndex(3), 1);
  assert.equal(preferredStoryIndex(0), 1);
});

test('every scheduled format is a known format', () => {
  const known = new Set(Object.values(FORMATS));
  for (const f of FORMAT_SCHEDULE) assert.ok(known.has(f), f);
});

// ── Research learning lifecycle ──────────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 24, 12, 0);

function stamp(daysAgo) {
  // "YYYY-MM-DD HH:mm" in local time, as research-scout writes it
  const d   = new Date(NOW - daysAgo * DAY);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function block({ daysAgo, source = 'reddit', url, finding, status = 'staged' }) {
  return [
    `## [${stamp(daysAgo)}] — ${source}`,
    `**URL:** ${url}`,
    `**Finding:** ${finding}`,
    `**Score:** 5`,
    `**Status:** ${status}`,
  ].join('\n');
}

function fixture() {
  return '# New Learnings\n\n---\n' + [
    block({ daysAgo: 15, url: 'https://old.example.com/a', finding: 'instagram reels tip' }),
    block({ daysAgo: 8,  url: 'https://www.reddit.com/r/x/1', finding: 'instagram carousel hook trick' }),
    block({ daysAgo: 3,  url: 'https://reddit.com/r/y/2', finding: 'carousel instagram engagement' }),
    block({ daysAgo: 8,  url: 'https://news.ycombinator.com/item?id=1', finding: 'openai release' }),
    block({ daysAgo: 20, url: 'https://done.example.com', finding: 'old promoted thing', status: 'promoted' }),
  ].join('\n\n---\n\n') + '\n';
}

test('parseEntries reads date, url, finding, status (default staged)', () => {
  const entries = parseEntries(fixture());
  assert.equal(entries.length, 5);
  assert.deepEqual(entries.map(e => e.status),
    ['staged', 'staged', 'staged', 'staged', 'promoted']);
  const noStatus = parseEntries('## [2026-01-01 10:00] — hn\n**URL:** https://x.com\n**Finding:** f');
  assert.equal(noStatus[0].status, LEARNING_STATUS.STAGED);
});

test('nextLearningStatus applies expire / confirm / stay rules', () => {
  const entries = parseEntries(fixture());
  const staged  = entries.filter(e => e.status === 'staged');
  const next    = entries.map(e => nextLearningStatus(e, staged, NOW));
  assert.deepEqual(next, ['expired', 'promoted', 'staged', 'staged', 'promoted']);
});

test('nextLearningStatus: terminal states never change', () => {
  for (const status of ['promoted', 'expired']) {
    const e = { status, date: stamp(30), url: '', finding: '' };
    assert.equal(nextLearningStatus(e, [], NOW), status);
  }
});

test('nextLearningStatus: same-run-date entries cannot confirm each other', () => {
  const a = { status: 'staged', date: stamp(8), url: 'https://reddit.com/1', finding: 'instagram carousel' };
  const b = { status: 'staged', date: a.date,   url: 'https://reddit.com/2', finding: 'instagram carousel' };
  assert.equal(nextLearningStatus(a, [a, b], NOW), 'staged');
});

test('ageInDays uses the injected clock', () => {
  assert.ok(Math.abs(ageInDays(stamp(7), NOW) - 7) < 0.01);
});

// Characterisation test: runs the real promote-learnings.js against a temp copy
// of the repo layout, so the file it rewrites is never the live memory file.
test('promote-learnings.js rewrites statuses and appends promoted findings to SOUL.md', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'promote-'));
  try {
    fs.mkdirSync(path.join(tmp, 'scripts'));
    fs.mkdirSync(path.join(tmp, 'memory'));
    for (const f of fs.readdirSync(path.join(ROOT, 'scripts'))) {
      if (f.endsWith('.js')) fs.copyFileSync(path.join(ROOT, 'scripts', f), path.join(tmp, 'scripts', f));
    }
    const learningsPath = path.join(tmp, 'memory', 'new_learnings.md');
    // Build the fixture against the real clock (the script uses Date.now()).
    const realNow = Date.now();
    const shift = d => new Date(realNow - d * DAY);
    const pad = n => String(n).padStart(2, '0');
    const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const content = fixture().replace(/## \[[^\]]+\]/g, (() => {
      const ages = [15, 8, 3, 8, 20];
      let i = 0;
      return () => `## [${fmt(shift(ages[i++]))}]`;
    })());
    fs.writeFileSync(learningsPath, content);
    fs.writeFileSync(path.join(tmp, 'SOUL.md'), '# Soul\n');

    const out = execFileSync(process.execPath, [path.join(tmp, 'scripts', 'promote-learnings.js')], { encoding: 'utf8' });

    const after = parseEntries(fs.readFileSync(learningsPath, 'utf8')).map(e => e.status);
    assert.deepEqual(after, ['expired', 'promoted', 'staged', 'staged', 'promoted']);
    assert.match(out, /Promote run complete: 2 promoted, 1 expired, 2 still staged/);

    const soul = fs.readFileSync(path.join(tmp, 'SOUL.md'), 'utf8');
    assert.match(soul, /## Research Learnings\n- \[\d{4}-\d{2}-\d{2}\] instagram carousel hook trick\n$/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
