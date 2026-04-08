'use strict';
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { generateContent } = require('./content-generator');
const { getOutputFolder }  = require('./image-renderer');
const { renderCoverSlide, validatePhoto } = require('./news-carousel');

// ── Reddit fetch ──────────────────────────────────────────────────────────────
// Pulls top posts from the past 24 hours from AI subreddits.
// Uses public JSON feed (no auth required).

const SUBREDDITS = ['ClaudeAI', 'ChatGPT', 'artificial'];
const MIN_UPVOTES = 100;

async function fetchRedditTopPosts() {
  const allPosts = [];

  for (const sub of SUBREDDITS) {
    try {
      const url = `https://www.reddit.com/r/${sub}/top.json?limit=5&t=day`;
      const res  = await fetch(url, {
        headers: { 'User-Agent': 'shadow-pages-bot/1.0' },
      });
      if (!res.ok) {
        console.warn(`[viral-demo] Reddit fetch failed for r/${sub}: ${res.status}`);
        continue;
      }
      const data  = await res.json();
      const posts = data?.data?.children || [];
      for (const { data: p } of posts) {
        // Must have enough upvotes and contain an external URL or media
        if (p.score < MIN_UPVOTES) continue;
        const hasLink  = p.url && !p.url.includes('reddit.com') && !p.url.endsWith('.jpg') && !p.url.endsWith('.png');
        const hasImage = p.post_hint === 'image' || p.url?.match(/\.(jpg|jpeg|png|gif|webp)$/i);
        const hasVideo = p.is_video || p.post_hint === 'hosted:video' || p.url?.includes('v.redd.it') || p.url?.includes('youtube') || p.url?.includes('youtu.be');
        if (!hasLink && !hasImage && !hasVideo) continue;

        allPosts.push({
          title:      p.title,
          url:        p.url,
          score:      p.score,
          subreddit:  sub,
          permalink:  `https://reddit.com${p.permalink}`,
          is_video:   !!hasVideo,
          thumbnail:  p.thumbnail && p.thumbnail.startsWith('http') ? p.thumbnail : null,
        });
      }
    } catch (err) {
      console.warn(`[viral-demo] Error fetching r/${sub}:`, err.message);
    }
  }

  // Sort by score descending, return top qualifying post
  allPosts.sort((a, b) => b.score - a.score);
  return allPosts;
}

// ── Main generator ────────────────────────────────────────────────────────────

async function generateViralDemoPost(niche = 'AI and productivity tools') {
  // 1. Fetch Reddit posts
  const posts = await fetchRedditTopPosts();

  if (posts.length === 0) {
    console.log('[viral-demo] no qualifying post found — slot skipped');
    return null;
  }

  const topPost = posts[0];
  console.log(`[viral-demo] Selected: "${topPost.title}" (${topPost.score} upvotes from r/${topPost.subreddit})`);

  // 2. Generate GPT content using viral_demo prompt
  const postContent = `${topPost.title}\nURL: ${topPost.url}\nSource: r/${topPost.subreddit} (${topPost.score} upvotes)`;
  let gptData;
  try {
    gptData = await generateContent('viral_demo', niche, postContent);
  } catch (err) {
    console.error('[viral-demo] GPT generation failed:', err.message);
    return null;
  }

  // 3. Render single cover image (no SWIPE badge — post_type: single_image)
  // Always use the real person's name for SerpApi photo fetch when available.
  const folder = getOutputFolder('viral-demo', gptData.headline || topPost.title);
  const imgPath = await renderCoverSlide(
    {
      headline:      gptData.headline || topPost.title.toUpperCase(),
      subtitle:      gptData.subtitle || '',
      photo_subject: gptData.person_name || gptData.visual_description || topPost.title,
    },
    folder,
    1,
    1,
    false  // isCarousel = false → no SWIPE badge
  );

  console.log(`[viral-demo] Cover image saved: ${imgPath}`);

  return {
    imagePath: imgPath,
    caption:   gptData.caption || '',
    headline:  gptData.headline,
    post_type: 'single_image',
    source:    `r/${topPost.subreddit}`,
  };
}

module.exports = { generateViralDemoPost };
