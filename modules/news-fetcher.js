require('dotenv').config();
const Parser = require('rss-parser');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const PHOTO_LIBRARY = {
  "Sam Altman":    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Sam_Altman_TechCrunch_SF_2019_Day_2_Oct_3_%28cropped%29.jpg/440px-Sam_Altman_TechCrunch_SF_2019_Day_2_Oct_3_%28cropped%29.jpg",
  "Elon Musk":     "https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/Elon_Musk_Royal_Society_%28crop2%29.jpg/440px-Elon_Musk_Royal_Society_%28crop2%29.jpg",
  "Jensen Huang":  "https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Jensen_Huang_at_COMPUTEX_2024_%28cropped%29.jpg/440px-Jensen_Huang_at_COMPUTEX_2024_%28cropped%29.jpg",
  "Sundar Pichai": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Sundar_Pichai_2015.jpg/440px-Sundar_Pichai_2015.jpg",
  "default":       null,
};

const RSS_FEEDS = [
  'https://techcrunch.com/category/artificial-intelligence/feed/',
  'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
  'https://www.wired.com/feed/tag/ai/latest/rss',
];

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function fetchRssStories() {
  const parser = new Parser();
  const stories = [];

  for (const feedUrl of RSS_FEEDS) {
    try {
      const feed = await parser.parseURL(feedUrl);
      for (const item of (feed.items || []).slice(0, 10)) {
        stories.push({
          title:  item.title || '',
          url:    item.link  || '',
          source: feed.title || feedUrl,
        });
      }
    } catch (err) {
      console.warn(`[news-fetcher] Failed to fetch ${feedUrl}: ${err.message}`);
    }
  }

  return stories;
}

function deduplicateStories(stories) {
  const seen = [];
  return stories.filter(story => {
    const titleLower = story.title.toLowerCase();
    const isDuplicate = seen.some(s => s.includes(titleLower) || titleLower.includes(s));
    if (!isDuplicate) {
      seen.push(titleLower);
      return true;
    }
    return false;
  });
}

async function scoreStories(stories) {
  const prompt = `You are a viral social media editor for an AI news Instagram page targeting 18-35 year olds.

Score each story 1-10 for viral engagement potential.

Score HIGH (8-10) for stories that are:
- Controversial or divisive (people will argue in comments)
- Shocking or surprising (readers will say 'wait, what?')
- About famous people doing unexpected things
- Threatening to jobs, privacy, or the status quo
- Record-breaking numbers or milestones
- Conflict between major companies or figures
- Clear villain or underdog narrative
- Involves money, power, or existential stakes

Score LOW (1-4) for stories that are:
- Dry technical product announcements
- Quarterly earnings reports with no controversy
- Minor software version updates
- Academic papers with no human interest angle
- Procedural regulatory updates

Score MEDIUM (5-7) for everything else.

Return JSON array with fields:
title, url, score, person (main person or null), source, hook_angle
(hook_angle: one sentence explaining WHY this story is provocative or shareable — used for caption writing. Be specific about the controversy or surprise element.)

Stories to score:
${JSON.stringify(stories.map(s => ({ title: s.title, url: s.url, source: s.source })), null, 2)}

Return only a valid JSON array, no other text.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
  });

  const content = response.choices[0].message.content.trim();
  const jsonStr = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(jsonStr);
}

async function findPhoto(person, storyTitle = null) {
  // Step 0: PHOTO_LIBRARY takes priority for known persons
  if (person && PHOTO_LIBRARY[person]) {
    console.log(`[findPhoto] Source: photo-library — "${person}"`);
    return PHOTO_LIBRARY[person];
  }

  // Step 1: Pexels — search by person name directly (no transformation)
  if (person && process.env.PEXELS_API_KEY) {
    try {
      const res = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(person)}&per_page=3`,
        { headers: { Authorization: process.env.PEXELS_API_KEY } }
      );
      if (res.ok) {
        const data = await res.json();
        const url = data.photos?.[0]?.src?.large2x;
        if (url) {
          console.log(`[findPhoto] Source: pexels — "${person}"`);
          return url;
        }
      }
    } catch (err) {
      console.warn(`[findPhoto] Pexels failed for "${person}": ${err.message}`);
    }
  }

  // Step 2: Unsplash — search by person name
  if (person && process.env.UNSPLASH_ACCESS_KEY) {
    try {
      const res = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(person)}&per_page=1&client_id=${process.env.UNSPLASH_ACCESS_KEY}`
      );
      if (res.ok) {
        const data = await res.json();
        const url = data.results?.[0]?.urls?.regular;
        if (url) {
          console.log(`[findPhoto] Source: unsplash — "${person}"`);
          return url;
        }
      }
    } catch (err) {
      console.warn(`[findPhoto] Unsplash failed for "${person}": ${err.message}`);
    }
  }

  // Step 3: Bing — search by person name
  if (person && process.env.BING_SEARCH_API_KEY) {
    try {
      const res = await fetch(
        `https://api.bing.microsoft.com/v7.0/images/search?q=${encodeURIComponent(person)}&count=1&imageType=Photo`,
        { headers: { 'Ocp-Apim-Subscription-Key': process.env.BING_SEARCH_API_KEY } }
      );
      if (res.ok) {
        const data = await res.json();
        const url = data.value?.[0]?.contentUrl;
        if (url) {
          console.log(`[findPhoto] Source: bing — "${person}"`);
          return url;
        }
      }
    } catch (err) {
      console.warn(`[findPhoto] Bing failed for "${person}": ${err.message}`);
    }
  }

  // Step 4: DALL-E 3 — contextual SCENE using story headline topic (NOT person name)
  if (process.env.OPENAI_API_KEY) {
    try {
      const topic = storyTitle || (person ? `${person} news story` : 'AI technology news');
      const dallePrompt = `Cinematic editorial scene representing ${topic}, dramatic lighting, dark moody atmosphere, no people, high resolution`;
      const response = await openai.images.generate({
        model: 'dall-e-3',
        prompt: dallePrompt,
        n: 1,
        size: '1024x1024',
      });
      const url = response.data?.[0]?.url;
      if (url) {
        console.log(`[findPhoto] Source: dall-e-3 — topic: "${topic}"`);
        return url;
      }
    } catch (err) {
      console.warn(`[findPhoto] DALL-E 3 failed: ${err.message}`);
    }
  }

  // Step 5: Gradient fallback (return null — renderers will use drawGradientFill)
  console.log(`[findPhoto] Source: gradient (all sources failed for: "${person}")`);
  return null;
}

async function fetchTopStories() {
  const raw = await fetchRssStories();
  const deduped = deduplicateStories(raw);

  if (deduped.length === 0) {
    throw new Error('[news-fetcher] No stories fetched from any RSS feed');
  }

  const scored = await scoreStories(deduped.slice(0, 20));
  scored.sort((a, b) => b.score - a.score);
  const top2 = scored.slice(0, 2);

  const stories = await Promise.all(top2.map(async (s) => {
    const person = (s.person && s.person !== 'null') ? s.person : null;
    return {
      title:      s.title,
      url:        s.url,
      hook_angle: s.hook_angle || '',
      person,
      photoUrl:   await findPhoto(person, s.title),
      source:     s.source,
    };
  }));

  return stories;
}

module.exports = { fetchTopStories, findPhoto, PHOTO_LIBRARY };

// ─── Direct test ──────────────────────────────────────────────────────────────
if (require.main === module) {
  fetchTopStories()
    .then(stories => {
      console.log('[news-fetcher] Top 2 stories:');
      stories.forEach((s, i) => console.log(`\nStory ${i + 1}:`, JSON.stringify(s, null, 2)));
    })
    .catch(err => {
      console.error('[news-fetcher] Error:', err);
      process.exit(1);
    });
}
