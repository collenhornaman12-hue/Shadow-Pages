# Shadow Pages — Builder Documentation
*The complete technical guide to building an automated Instagram 
content pipeline from scratch*

Last updated: April 9, 2026
Author: Built by Collen Hornaman
Account: @CuttingEdgeOfAI (live) | @EdgeOfTheWealthy (in development)
Working directory: C:\Users\colle\shadow-pages\

---

## What This Is

An autonomous Instagram content engine that finds breaking AI news,
generates branded carousel posts, and publishes them automatically —
four times per day, every day, without manual input.

Built on Node.js. Runs on a Windows PC via PM2. No monthly SaaS fees
beyond API costs. Total operating cost: approximately $15–25/month
depending on API usage volume.

This document covers every component in enough detail to replicate
the system from scratch or hand it to a developer to build for you.

---

## What It Does

Every day the pipeline:

1. Pulls the top AI news stories from RSS feeds and Reddit
2. Scores them for engagement potential using GPT-4o-mini
3. Selects the top two stories
4. Generates a 7-slide branded carousel for each story
5. Sources a real press photo of the named person or company
6. Renders all slides as flat PNG images using Sharp
7. Uploads to Cloudinary for hosting
8. Posts to Instagram via the Meta Graph API

In addition:
- A resource carousel posts at 6pm with copy-paste AI prompts
- A viral demo post fires at 7am sourced from Reddit top posts
- A seed bank of 30 content topics regenerates monthly
- A research scout runs nightly pulling Reddit and Hacker News
- A competitor intelligence report delivers to Telegram weekly

---

## Technical Stack

| Layer | Tool | Purpose |
|---|---|---|
| Runtime | Node.js | Core pipeline language |
| Process manager | PM2 | Scheduling, auto-restart on reboot |
| Content generation | GPT-4o-mini (OpenAI) | Story scoring, slide copy, captions |
| Image rendering | Sharp | Compositing slides as flat PNG files |
| Asset hosting | Cloudinary | Hosting rendered images for API upload |
| Photo sourcing | SerpApi + Pexels | Press photos of named individuals |
| News sourcing | NewsAPI + RSS feeds | TechCrunch, The Verge, Wired |
| Community sourcing | Reddit public JSON API | r/artificial, r/ChatGPT, r/ClaudeAI |
| Publishing | Meta Graph API | Instagram carousel posting |
| Competitor intel | n8n + Apify | Weekly scraping + Telegram delivery |
| Notifications | Telegram bot | Weekly intelligence reports |
| Monetization | Stan Store + ManyChat | Digital product sales + DM automation |
| Version control | GitHub (private) | collenhornaman12-hue/Shadow-Pages |

---

## File Structure
C:\Users\colle\shadow-pages
│
├── orchestrator.js              — Routes daily posting slots
├── post-now.js                  — Manual trigger for immediate post
├── SOUL.md                      — Brand identity, voice, content rules
├── USER.md                      — Persistent Claude Code context
│
├── modules/
│   ├── news-fetcher.js          — RSS + Reddit fetch, GPT scoring
│   ├── news-carousel.js         — News carousel renderer
│   ├── resource-carousel.js     — Resource carousel renderer
│   ├── image-renderer.js        — Core Sharp rendering engine
│   └── instagram-publisher.js  — Meta Graph API posting
│
├── scripts/
│   ├── research-scout.js        — Nightly Reddit/HN scraping
│   ├── promote-learnings.js     — Sunday learning promotion job
│   └── seed-bank-generator.js  — Monthly seed generation
│
├── memory/
│   ├── posted-stories.json      — Duplicate prevention log
│   ├── new_learnings.md         — Research scout output
│   ├── seed-bank.json           — 30 monthly content seeds
│   ├── seed-filter-log.txt      — Seed rejection log with timestamps
│   ├── AUDIENCE_PSYCHOLOGY_AI.md — AI niche audience map
│   └── MONETIZATION_MAP.md      — Full monetization architecture
│
├── test-renders/
│   ├── run-test-renders.js      — Runs all three post type renders
│   ├── news-carousel/           — Test render output
│   ├── resource-carousel/       — Test render output
│   └── viral-demo/              — Test render output
│
├── tasks/
│   ├── todo.md                  — Outstanding tasks
│   └── lessons.md               — Fix history and root causes
│
├── logs/
│   ├── errors.log               — Pipeline error log
│   └── token-usage.json         — Daily OpenAI token tracker
│
└── .env                         — All API credentials (never commit)

---

## Environment Variables

All credentials live in `.env` at the project root. Never commit this
file to GitHub — it is in `.gitignore`.
OPENAI_API_KEY=
SERPAPI_KEY=
PEXELS_API_KEY=
NEWSAPI_KEY=
IG_ACCOUNT_ID_CUTTINGEDGE=17841439475534779
IG_TOKEN_CUTTINGEDGE=           ← expires May 2026 — renew monthly
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

---

## Posting Schedule

PM2 manages four daily slots. Times are EST.

| Slot | Time | Post Type | Content Source |
|---|---|---|---|
| 0 | 7am | viral_demo | Reddit top posts (r/ClaudeAI, r/ChatGPT) |
| 1 | 12pm | news_carousel | RSS feeds + GPT scoring |
| 2 | 6pm | resource_carousel | Seed bank + AUDIENCE_PSYCHOLOGY_AI.md |
| 3 | 9pm | news_carousel | RSS feeds + GPT scoring |

---

## Visual Design System

All posts follow this locked design spec. Do not deviate.

**Colors**
- Primary dark: `#0d0d0d`
- Gold accent: `#E8C547`
- White text: `#FFFFFF`
- Secondary text: 60% opacity white

**Typography**
- Headlines: Arial Black, all caps
- Body: Arial Black, sentence case
- Labels: Arial, gold, 22px
- Secondary: Arial, italic, 60% opacity

**Canvas**
- Dimensions: 1080 x 1080px (square)
- All slides rendered as flat PNG

**Cover slide**
- Full-bleed press photo behind dark gradient overlay
- Two-zone gradient: top 70% full brightness, bottom 30% darkened
- Bold white headline, bottom 40% of canvas, Impact font
- SWIPE badge gold bottom right
- "CUTTING EDGE OF AI" watermark top left

**Inner slides — Type A (slide 2)**
- Source Receipt Card: 80% canvas width, dark background
- Shows source name, headline, date
- Gold border, larger fonts

**Inner slides — Type B (slides 3–6)**
- Three-layer text system anchored at Y=810px
- Layer 1: Gold label, 22px Arial
- Layer 2: White primary text, Arial Black, scaled by word count
- Layer 3: Gold italic secondary, 60% opacity (optional)
- 80px padding, dark background

**CTA slide (final slide)**
- Dark background `#0d0d0d`
- Ghost keyword: 96px, 4% opacity, centered in void
- Keyword by post type: BREAKING / PROMPTS / WORKFLOW
- Stan Store link: stan.store/cuttingedgeofai
- Handle: @cuttingedgeofai

---

## Photo Sourcing

Photos are sourced through a three-tier fallback chain:

1. **SerpApi** — Google image search for named person
   Pass the raw person name exactly as it appears in the story.
   Never transform or derive the query.
2. **Pexels** — Fallback for generic imagery or if SerpApi fails
3. **Dark gradient** — Final fallback if both APIs fail

Known gap: SerpApi occasionally returns wrong images for less
prominent individuals. Validation layer exists but is not perfect.
For named individuals, always pass the full name raw.

---

## Content Intelligence Layer

### Research Scout
**File:** `scripts/research-scout.js`
**Schedule:** Nightly at 1am, 3am, 5am EST
**What it does:** Pulls Reddit and Hacker News, cross-references
findings against SOUL.md and USER.md, stages validated learnings
to `memory/new_learnings.md`

### Promote Learnings
**File:** `scripts/promote-learnings.js`
**Schedule:** Sundays at 9am EST
**What it does:** Promotes staged learnings from new_learnings.md
into the active content system

### Seed Bank Generator
**File:** `scripts/seed-bank-generator.js`
**Schedule:** Monthly at 2am on the 1st
**What it does:** Pulls RSS headlines, Reddit, and new_learnings.md,
calls GPT-4o-mini, generates 30 content seeds to seed-bank.json
**Filter:** isValidSeed() rejects seeds with banned hook patterns
before writing. Rejections logged to seed-filter-log.txt.

---

## Competitor Intelligence

**Tool:** n8n (self-hosted Docker at localhost:5678) + Apify
**Schedule:** Weekly, Sunday 7am scrape / 9am report delivery
**Output:** Telegram bot @Insta_Judgement_Bot (Chat ID: 5488630825)
**Coverage:** Both @CuttingEdgeOfAI and @EdgeOfTheWealthy niches

Known gap: Apify data quality is inconsistent. Reports deliver but
scraped engagement data is not fully reliable. Fix before wiring
into post generation.

---

## Monetization Architecture

See `memory/MONETIZATION_MAP.md` for full detail.

**Summary:**
- Stan Store: stan.store/cuttingedgeofai — $17 prompt product (placeholder)
- ManyChat: Live as of April 9, 2026 — 5 keyword triggers wired
- Keywords: BREAKING, PROMPTS, TOOLS, WORKFLOW, LINK
- All keywords fire same DM: Stan Store link + follow nudge
- Product ladder planned: AI News Workflow Kit → Prompt Packs →
  Briefing Template → Shadow Pages Starter Kit

---

## Monthly Operating Costs

| Service | Cost | Notes |
|---|---|---|
| OpenAI GPT-4o-mini | ~$5–10/mo | Content generation + scoring |
| SerpApi | ~$5/mo | Press photo sourcing |
| Pexels | Free | Fallback photos |
| NewsAPI | Free tier | RSS news sourcing |
| Cloudinary | Free tier | Image hosting |
| Meta Graph API | Free | Instagram publishing |
| n8n (self-hosted) | Free | Docker on local machine |
| Apify | ~$5/mo | Competitor scraping |
| Stan Store | $29/mo | Digital product storefront |
| ManyChat PRO | $15/mo | Comment trigger DM automation |
| **Total** | **~$59–74/mo** | Before Stan Store revenue |

---

## PM2 Commands

```bash
# Start the pipeline
pm2 start orchestrator.js --name shadow-pages

# View status
pm2 status

# View live logs
pm2 logs shadow-pages

# Restart after code changes
pm2 restart shadow-pages

# Stop pipeline
pm2 stop shadow-pages

# Save PM2 config (survives reboot)
pm2 save

# Start on system boot
pm2 startup
```

---

## Running a Manual Test Post

```bash
node post-now.js
```

This triggers the orchestrator immediately outside the PM2 schedule.
Use this to test after code changes before restarting the scheduler.

---

## Running Test Renders

```bash
node test-renders/run-test-renders.js
```

Renders all three post types (news carousel, resource carousel,
viral demo) to the test-renders/ folder without publishing.
Review visually before pushing any visual system changes live.

---

## Adding a Second Account (@EdgeOfTheWealthy)

All pipeline modules are built to support multiple accounts.
Steps to activate @EdgeOfTheWealthy:

1. Create a new Facebook account
2. Create a Facebook Page under that account
3. Link @EdgeOfTheWealthy Instagram to the Facebook Page
4. Generate a new long-lived IG token via Meta Graph API Explorer
5. Add to .env:
   IG_ACCOUNT_ID_WEALTHYEDGE=
   IG_TOKEN_WEALTHYEDGE=
6. Create memory/AUDIENCE_PSYCHOLOGY_WEALTHY.md
7. Add a second orchestrator config pointing to the wealthy account
8. Register new PM2 slots for the wealthy account schedule

---

## Known Issues and Gaps

| Issue | Status | Fix |
|---|---|---|
| SerpApi wrong person photo | Known, partial fix in place | Improve validation layer |
| Apify competitor data unreliable | Known, not fixed | Fix before wiring into post gen |
| Seed quality ~60–90% sharp | Improving — filter added | Monitor seed-filter-log.txt |
| IG token expires May 2026 | Not yet renewed | Renew before end of April |
| @EdgeOfTheWealthy not live | Blocked on Facebook Page | New Facebook account required |
| Pipeline docs as client deliverable | This document | ✅ Complete |

---

## What To Build Next

In priority order:

1. Activate @EdgeOfTheWealthy (new Facebook account)
2. Renew IG token before May expiry
3. Fix Apify data quality then wire competitor intel into post gen
4. Build AI News Workflow Kit (first real Stan Store product, $27–47)
5. Add ManyChat keyword selection logic into post generation (Brief 4
   wired keywords — automation of keyword selection pending)

---

## Replicating This System

If you are building this from scratch the recommended sequence is:

1. Create Instagram Business accounts and Facebook Pages
2. Set up Meta Developer App and obtain long-lived token
3. Scaffold Node.js project, install dependencies, configure .env
4. Build image-renderer.js — get a single slide rendering cleanly
5. Build news-fetcher.js — confirm RSS pulls and GPT scoring works
6. Build news-carousel.js — confirm full 7-slide carousel renders
7. Build resource-carousel.js — confirm resource format renders
8. Build instagram-publisher.js — confirm single post publishes
9. Wire orchestrator.js — confirm all four slots route correctly
10. Register PM2 schedule — confirm posts fire on time
11. Add research-scout.js — nightly intelligence layer
12. Add seed-bank-generator.js — monthly content seeds
13. Set up n8n + Apify — weekly competitor intelligence
14. Set up Stan Store — digital product storefront
15. Set up ManyChat — comment trigger DM automation

Dependencies to install:
```bash
npm install openai sharp cloudinary axios dotenv
npm install node-fetch rss-parser pm2
```

---

*This document is the foundation for the Shadow Pages Starter Kit
digital product. Version 1.0 — April 9, 2026.*
