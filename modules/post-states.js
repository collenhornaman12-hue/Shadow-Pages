// modules/post-states.js
// Single source of truth for the posting state machines (pure — no I/O, no deps).
// See STATE_MACHINES.md. Update both when you add a state.

'use strict';

// ── Instagram Graph API media container lifecycle ────────────────────────────
// Values of `status_code` returned by GET /{container-id}?fields=status_code.
const CONTAINER_STATUS = Object.freeze({
  IN_PROGRESS: 'IN_PROGRESS',
  FINISHED:    'FINISHED',
  ERROR:       'ERROR',
  EXPIRED:     'EXPIRED',
  PUBLISHED:   'PUBLISHED',
});

// What the poller does next for a given status_code:
//   'ready'  → stop polling, container can be published
//   'failed' → stop polling, throw
//   'wait'   → poll again after the interval (anything else, including
//              IN_PROGRESS, EXPIRED, PUBLISHED, missing/unknown values)
function containerStep(statusCode) {
  if (statusCode === CONTAINER_STATUS.FINISHED) return 'ready';
  if (statusCode === CONTAINER_STATUS.ERROR) return 'failed';
  return 'wait';
}

// ── CuttingEdge slot → post format (orchestrator.js) ─────────────────────────
const FORMATS = Object.freeze({
  VIRAL_DEMO:        'viral_demo',
  QUOTE:             'quote',             // handled, not in schedule
  NEWS_CAROUSEL:     'news-carousel',
  RESOURCE_CAROUSEL: 'resource-carousel',
  REEL:              'reel',              // handled, not in schedule
});

// Index = slotIndex % length. Order matches config/pages.json postSchedule.
const FORMAT_SCHEDULE = Object.freeze([
  FORMATS.VIRAL_DEMO,
  FORMATS.NEWS_CAROUSEL,
  FORMATS.RESOURCE_CAROUSEL,
  FORMATS.NEWS_CAROUSEL,
]);

function formatForSlot(slotIndex) {
  return FORMAT_SCHEDULE[slotIndex % FORMAT_SCHEDULE.length];
}

// News slots share one daily story list: slot 1 starts at story[0], slot 3 at story[1].
function preferredStoryIndex(slotIndex) {
  return (slotIndex % FORMAT_SCHEDULE.length) === 1 ? 0 : 1;
}

module.exports = {
  CONTAINER_STATUS,
  containerStep,
  FORMATS,
  FORMAT_SCHEDULE,
  formatForSlot,
  preferredStoryIndex,
};
