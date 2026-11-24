# State machines

Every implicit state machine in Shadow Pages, where it lives and what moves it.
**Update this file when you add a state, a format or a transition.**
Typed sources of truth: `modules/post-states.js` and `scripts/learning-lifecycle.js`, both pure and covered by `npm test` (`node --test`, no network, never posts).

---

## 1. Instagram media container (Graph API)

- **Lives in:** `modules/post-states.js` (`CONTAINER_STATUS`, `containerStep`), used by `waitForContainer` in `modules/instagram-publisher.js`. `post-now.js` has its own copy of the loop (manual one-off script).
- **States (`status_code`):** `IN_PROGRESS` → `FINISHED` | `ERROR` | `EXPIRED` | `PUBLISHED`.
- **Poller step:** `FINISHED` → `ready` (publish it) · `ERROR` → `failed` (throw `Container error: …`) · anything else → `wait` 5 s and poll again.
- **Timeouts:** 120 s for images and carousel children, 300 s for reels, then throw `Container timed out`.
- **Known gaps (not changed):** `EXPIRED` keeps polling until the timeout instead of failing fast. `post-now.js` goes on to publish when its 120 s deadline passes, where the publisher throws.

## 2. Publish pipeline (per post)

- **Lives in:** `postImage`, `postCarousel`, `postReel` in `modules/instagram-publisher.js`.
- **Image / reel:** create container → wait (§1) → `media_publish` → done.
- **Carousel:** for each image: create child → wait → collect id; then create `CAROUSEL` container → wait → `media_publish`.
- **Failure:** any `error` field throws; the whole sequence is wrapped in `withRetry` (§3), so a retry starts again from container creation.
- **Invariant:** publish is only called after the container reached `FINISHED`.
- **Risk:** if `media_publish` succeeded but its response failed to parse, a retry posts again.

## 3. Retry

- **Lives in:** `modules/retry.js`.
- **States:** attempt 1 → (fail, wait 5 s) attempt 2 → (fail, wait 15 s) attempt 3 → success | exhausted.
- **Exhausted:** writes one line to `logs/errors.log` via `logError`, rethrows the last error.

## 4. Slot → format rotation (@CuttingEdgeOfAI)

- **Lives in:** `modules/post-states.js` (`FORMATS`, `FORMAT_SCHEDULE`, `formatForSlot`, `preferredStoryIndex`); times in `config/pages.json` `postSchedule`; cron set up by `scheduler.js` (±5 min jitter).
- **Rotation:** slot 0 `viral_demo` · slot 1 `news-carousel` (starts at story[0]) · slot 2 `resource-carousel` · slot 3 `news-carousel` (starts at story[1]).
- **Handled but unscheduled:** `quote`, `reel` (reel falls back to a single image when ffmpeg is missing).
- **To add a format:** add it to `FORMATS`, add a branch in `runSlot`, put it in `FORMAT_SCHEDULE` if it should run, update this file and the test.

## 5. Slot run outcome (`runSlot`)

- **Lives in:** `runSlot` in `orchestrator.js` (CuttingEdge) and `orchestrator-wealthy.js` (EdgeOfTheWealthy, own cron: 8:00 `viral_demo`, 13:00 `news-carousel-morning`, 17:00 `resource-carousel`, 20:00 `news-carousel-evening`).
- **Outcomes:** `posted` · `skipped` (no background images, no viral demo found, no non-duplicate story, pre-post dedup guard, `TokenLimitExceededError`) · `failed` (any other error: logged, rethrown, caught and printed by the scheduler).
- **Outcome is implicit:** `runSlot` returns `undefined` in every case; read the log line to tell skipped from posted.
- **Partial state:** CuttingEdge `news-carousel` posts the hook image first, then the carousel; if the carousel fails, the hook stays posted alone and the story is not marked posted. The wealthy news slot posts the carousel only.
- `getToken` throws before the `try`, so a missing token is not written to `logs/errors.log`.

## 6. Story dedup

- **Lives in:** `isDuplicateStory`, `markStoryPosted`, `savePostedStories` in `orchestrator.js` (same helpers in `orchestrator-wealthy.js`); data in `memory/posted-stories.json` with a `.lock` file.
- **States per story key (first 8 words, lower-cased):** `unseen` → `posted` (after a successful `postCarousel`) → `forgotten` (dropped from the file after 48 h). Counts as a duplicate for 24 h.
- **Guards:** checked when picking the story and again right before posting. Lock held → wait 500 ms once → throw.

## 7. Daily token budget

- **Lives in:** `checkTokenLimit`, `recordTokenUsage` in `modules/content-generator.js`; data in `logs/token-usage.json`.
- **States per UTC date:** `available` → `exhausted` once `tokens >= DAILY_TOKEN_LIMIT`; a new date resets to `available` with 0 tokens.
- **Exhausted:** `generateContent` throws `TokenLimitExceededError`, and `runSlot` turns it into `skipped`.

## 8. Content fallbacks and daily caches

- **News carousel renderer:** v2 (`renderNewsCarouselV2` / wealthy builder) → on any error, or when no 7-slide GPT data was produced, legacy renderer.
- **Caption:** GPT carousel caption if present → else `generateCaption`.
- **News stories:** in-memory cache keyed by ISO date, shared by both news slots in one process.
- **Resource content:** `cache/resource-cache.json` keyed by date; post type rotates by day of year over `POST_TYPES` (8 entries) and subcategory over `SUBCATEGORIES` (5), both in `modules/resource-generator.js`.

## 9. Research learning lifecycle

- **Lives in:** `scripts/learning-lifecycle.js` (`LEARNING_STATUS`, `nextLearningStatus`); written by `scripts/research-scout.js` (01:00, 03:00, 05:00 daily), advanced by `scripts/promote-learnings.js` (Sunday 09:00); data in `memory/new_learnings.md` (`**Status:** …` line per entry).
- **States:** `staged` → `expired` | `promoted`. Both are terminal.
- **Transitions (run once a week):**
  - `staged` and age ≥ 14 days → `expired`.
  - `staged`, 7 ≤ age < 14 days, and another entry that was `staged` at the start of the run has a different run date, the same domain and 2+ shared keywords → `promoted`; its finding is appended to `SOUL.md` under `## Research Learnings`.
  - Otherwise it stays `staged`.
- **Invariants:** only `staged` entries change; confirmation uses the statuses read at the start of the run; each entry is rewritten in place by its own block text.
