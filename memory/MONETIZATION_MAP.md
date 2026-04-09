# MONETIZATION_MAP.md
*Last updated: April 9, 2026*

---

## Purpose

This document maps the full monetization architecture for the Shadow Pages
business. It is the required reference before any monetization logic gets
wired into the pipeline via code. All ManyChat automation, product ladder
decisions, and revenue sequencing live here.

---

## Current State (April 9, 2026)

| Layer | Status |
|---|---|
| Stan Store | ✅ Live — stan.store/cuttingedgeofai |
| $17 Prompt Sheet | ✅ Live — placeholder product |
| ManyChat comment triggers | ✅ Live — wired April 9 |
| ManyChat code automation | ❌ Not built — requires this doc first |
| Product ladder | ❌ Not built — planned |
| @EdgeOfTheWealthy monetization | ❌ Not started |

---

## Stan Store

**URL:** stan.store/cuttingedgeofai
**Current product:** 100 Best AI Prompts for Productivity — $17
**Status:** Placeholder. Stays live until replaced by a better product.

---

## ManyChat — Keyword Trigger Map

All five keywords are live as of April 9, 2026. All fire the same DM flow.

| Keyword | Post Type It Appears On | Intent |
|---|---|---|
| `BREAKING` | News carousels | Breaking AI news hook |
| `PROMPTS` | Resource carousels | Prompt pack request |
| `TOOLS` | Resource carousels | AI tools request |
| `WORKFLOW` | Viral demo posts | Workflow/automation request |
| `LINK` | Any post | Catch-all for link requests |

**DM Flow (live):**
- Opening DM: delivers Stan Store link + follow nudge + "See the Full Prompt
  List" button
- Follow-up DM (if no click): "Quick reminder — you commented for a reason 😅
  here's that link: stan.store/cuttingedgeofai"

**Next code task:** Wire keyword selection into post generation so CTA slides
automatically use the contextually correct keyword per post type. Brief 4.

---

## Product Ladder (Planned — build in this order)

### Current
**$17 — AI Prompt Sheet** *(placeholder, live now)*
Generic prompt PDF. Stays live until Option 1 is ready.

### Option 1 — AI News Workflow Kit *(build next)*
**Price:** $27–$47
**What it is:** How the Shadow Pages pipeline was built — the full behind-the-
scenes system for finding AI stories, generating carousels, and posting
automatically. Sold as a PDF/Notion doc with screenshots and architecture
diagrams.
**Why it sells:** The audience follows because they want to do what this
account does. Sell them the blueprint.
**Trigger to build:** After ManyChat is proven and generating clicks.

### Option 2 — Niche-Specific Prompt Packs
**Price:** $17–$27
**What it is:** Highly targeted prompt collections. Not "100 prompts" — one
specific use case per pack. Example: "The Founder's AI Toolkit — 20 prompts
that replace your copywriter, researcher, and strategist."
**Why it sells:** Specificity commands premium pricing. Generic prompt sheets
are commoditized. Specific ones aren't.
**Trigger to build:** After Option 1 is live.

### Option 3 — Weekly AI Briefing Template
**Price:** $12–$17
**What it is:** A Notion or Google Doc template that helps someone build their
own AI news tracker and research system.
**Why it sells:** Low price point, high utility, pairs directly with the
account's content angle.
**Trigger to build:** After Option 2 is live.

### Option 4 — Shadow Pages Starter Kit *(flagship product)*
**Price:** $47–$97
**What it is:** Full pipeline blueprint for building an automated Instagram
page. Includes architecture docs, prompt templates, PM2 setup guide, and
visual system specs.
**Why it sells:** Done-for-you automation is the agency pitch. This is the
self-serve version. Also serves as the agency proof of concept.
**Trigger to build:** After pipeline is documented as a client deliverable.
Feeds directly into agency launch.

---

## Revenue Sequencing

Now:
- ManyChat live → drives traffic to $17 prompt sheet
- Every post fires a keyword → auto-DM → Stan Store link

Next (after ManyChat proves CTR):
- Replace $17 sheet with Option 1 (AI News Workflow Kit)
- Price increase to $27–$47
- Update DM copy to match new product

Then:
- Add Option 2 as a second Stan Store product
- Run both simultaneously — different audience segments

Eventually:
- Option 4 (Shadow Pages Starter Kit) becomes the flagship
- Feeds agency pipeline — same doc serves as client deliverable

---

## @EdgeOfTheWealthy Monetization (Planned)

Separate Stan Store page or second product on same store.
Affiliate angle: Webull (trading app), ClickBank wealth courses.
ManyChat triggers: same architecture, different keywords TBD.
Requires `memory/AUDIENCE_PSYCHOLOGY_WEALTHY.md` first.

---

## Affiliate Programs (On Deck — not active yet)

| Program | Niche | Commission | Status |
|---|---|---|---|
| Jasper AI | AI/Productivity | 30% recurring | Not signed up |
| ElevenLabs | AI/Productivity | 22% recurring | Not signed up |
| Webull | Wealth | $12–20 per signup | Not signed up |
| ClickBank wealth courses | Wealth | 50–75% per sale | Not signed up |
| NordVPN | Any | 40–100% first sale | Not signed up |

Activate affiliates after Option 1 product is live and driving consistent
Stan Store traffic. Don't dilute the funnel until the core product converts.

---

## Notes

- ManyChat PRO trial expires April 23, 2026 — cancel or convert
- IG token expires May 2026 — renew before monetization compounds
- Do not wire affiliate links into pipeline until MONETIZATION_MAP v2
