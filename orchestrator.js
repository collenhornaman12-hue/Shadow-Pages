require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { generateContent, TokenLimitExceededError } = require('./modules/content-generator');
const {
  getOutputFolder,
  renderQuoteImage,
  renderQuoteSlide,
  renderNewsHookImage,
  renderNewsCarousel,
} = require('./modules/image-renderer');
const { buildCarousel } = require('./modules/carousel-builder');
const { renderNewsCarouselV2 }     = require('./modules/news-carousel');
const { renderNewsCarouselLegacy } = require('./modules/news-carousel-legacy');
const { upload } = require('./modules/uploader');
const { postImage, postCarousel, postReel } = require('./modules/instagram-publisher');
const { generateCaption } = require('./modules/caption-generator');
const { logError } = require('./modules/logger');
const { fetchTopStories } = require('./modules/news-fetcher');
const { generateResourceCarousel } = require('./modules/resource-generator');
const { generateViralDemoPost }    = require('./modules/viral-demo-generator');

const pages = require('./config/pages.json');

function checkFfmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const FFMPEG_AVAILABLE = checkFfmpeg();

function getValidBgFiles(bgFolder) {
  if (!fs.existsSync(bgFolder)) return [];
  return fs.readdirSync(bgFolder).filter(function(f) {
    return /\.(jpg|jpeg|png)$/i.test(f);
  });
}

function pickBg(bgFolder) {
  const files = getValidBgFiles(bgFolder);
  if (files.length === 0) return null;
  return path.join(bgFolder, files[Math.floor(Math.random() * files.length)]);
}

function pickTopic(page) {
  const topics = page.carouselTopics || [page.niche + ' tips'];
  return topics[Math.floor(Math.random() * topics.length)];
}

const AI_TOPICS = [
  "How OpenAI's o3 model beats human experts at reasoning",
  "Anthropic Claude vs GPT-4o — which is actually better in 2026",
  "The AI tools Jensen Huang uses every day",
  "Why Sam Altman said AGI is closer than anyone thinks",
  "How to use Grok 3 for free right now",
  "The 7 AI tools replacing entire job functions in 2026",
  "Why Apple Intelligence failed and what comes next",
  "How Perplexity AI is killing Google Search",
  "DeepSeek R2: what China's new AI model can actually do",
  "How Midjourney V7 changed AI image generation forever",
  "The real reason Google is scared of ChatGPT",
  "How AI agents are replacing entire marketing teams",
  "Elon Musk's Grok vs OpenAI: what the data actually shows",
  "The AI tools making $10K/month for solo creators in 2026",
  "Why Microsoft Copilot is now inside every Office app",
  "How Runway Gen-3 is replacing video editors",
  "The hidden AI features inside tools you already use",
  "Why every Fortune 500 is replacing consultants with AI",
  "How to build a full business with Claude Sonnet in a weekend",
  "The AI model that passed the bar exam, medical boards, and CPA"
];

function getCarouselTopic(page) {
  const pageTopics = page?.carouselTopics || [];
  const pool = pageTopics.length > 0 && Math.random() > 0.5 ? pageTopics : AI_TOPICS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function getToken(page) {
  const envVar = page.igTokenEnvVar;
  if (!envVar) {
    throw new Error(`No igTokenEnvVar defined for page ${page.name}`);
  }
  const token = process.env[envVar];
  if (!token) {
    throw new Error(`Environment variable ${envVar} is not set`);
  }
  return token;
}

async function createReelVideo(framePaths, outputPath) {
  // Create a concat file for ffmpeg
  const concatFile = outputPath.replace('.mp4', '_concat.txt');
  const concatContent = framePaths.map(p => `file '${path.resolve(p)}'\nduration 2`).join('\n');
  fs.writeFileSync(concatFile, concatContent);

  try {
    // Create video from images: 2 seconds per frame, 30fps
    execSync(
      `ffmpeg -y -f concat -safe 0 -i "${concatFile}" -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=30" -c:v libx264 -pix_fmt yuv420p -t 12 "${outputPath}"`,
      { stdio: 'pipe' }
    );
    return true;
  } finally {
    if (fs.existsSync(concatFile)) fs.unlinkSync(concatFile);
  }
}

const FORMAT_SCHEDULE = ['viral_demo', 'news-carousel', 'resource-carousel', 'news-carousel'];

// Daily news stories cache — shared between slots 1 and 3
let _newsCache = { date: null, stories: null };

// ── Duplicate story prevention ────────────────────────────────────────────────
const POSTED_STORIES_PATH = path.join(__dirname, 'memory', 'posted-stories.json');

function loadPostedStories() {
  try { return JSON.parse(fs.readFileSync(POSTED_STORIES_PATH, 'utf8')); }
  catch { return []; }
}

function savePostedStories(entries) {
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  const trimmed = entries.filter(e => e.timestamp > cutoff);
  fs.mkdirSync(path.dirname(POSTED_STORIES_PATH), { recursive: true });
  fs.writeFileSync(POSTED_STORIES_PATH, JSON.stringify(trimmed, null, 2));
}

function storyKey(headline) {
  return String(headline || '').trim().split(/\s+/).slice(0, 8).join(' ').toLowerCase();
}

function isDuplicateStory(headline) {
  const key    = storyKey(headline);
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return loadPostedStories().some(e => e.timestamp > cutoff && storyKey(e.headline) === key);
}

function markStoryPosted(headline) {
  const posted = loadPostedStories();
  posted.push({ headline: String(headline), timestamp: Date.now() });
  savePostedStories(posted);
}

async function getNewsStories() {
  const today = new Date().toISOString().slice(0, 10);
  if (_newsCache.date === today && _newsCache.stories) {
    return _newsCache.stories;
  }
  const stories = await fetchTopStories();
  _newsCache = { date: today, stories };
  return stories;
}

async function runSlot(page, slotIndex) {
  const format = FORMAT_SCHEDULE[slotIndex % FORMAT_SCHEDULE.length];
  const retryOptions = { page: page.name, slot: slotIndex };

  // Validate background folder
  const bg = pickBg(page.bgFolder);
  if (!bg) {
    const err = new Error(`No background images found in ${page.bgFolder}`);
    logError({ page: page.name, slot: slotIndex, error: err });
    console.error(`[${page.name}] Skipping slot ${slotIndex}: ${err.message}`);
    return;
  }

  const timestamp = Date.now();
  const token = getToken(page);

  console.log('[' + page.name + '] Running slot ' + slotIndex + ' — format: ' + format);

  try {
    if (format === 'viral_demo') {
      console.log('[' + page.name + '] Generating viral demo post...');
      const demo = await generateViralDemoPost(page.niche);

      if (!demo) {
        console.log('[' + page.name + '] [viral-demo] no qualifying post found — slot skipped');
        return;
      }

      const imageUrl = await upload(demo.imagePath, page.id, retryOptions);
      await postImage({ igId: page.igAccountId, token, imageUrl, caption: demo.caption }, retryOptions);
      console.log('[' + page.name + '] Viral demo posted: ' + demo.headline);

    } else if (format === 'quote') {
      const quote = await generateContent('quote', page.niche, '', retryOptions);
      console.log('[' + page.name + '] Quote: ' + quote);

      const quoteFolder = getOutputFolder('quote', quote);
      const imgPath     = await renderQuoteSlide(quote, quoteFolder);

      const imageUrl = await upload(imgPath, page.id, retryOptions);

      const caption = await generateCaption(page.niche, quote, retryOptions);
      await postImage({ igId: page.igAccountId, token, imageUrl, caption }, retryOptions);
      console.log('[' + page.name + '] Quote posted');

    } else if (format === 'news-carousel') {
      const stories = await getNewsStories();
      // Slot 1 → story[0], slot 3 → story[1]
      const preferredIndex = (slotIndex % FORMAT_SCHEDULE.length) === 1 ? 0 : 1;
      let story = null;
      for (let si = preferredIndex; si < stories.length; si++) {
        if (!isDuplicateStory(stories[si].title)) { story = stories[si]; break; }
        console.log(`[${page.name}] Skipping duplicate story: ${stories[si].title}`);
      }
      if (!story) {
        console.log(`[${page.name}] All stories are duplicates — slot skipped`);
        return;
      }
      console.log('[' + page.name + '] News carousel: ' + story.title);

      // Generate 5-slide content (legacy fallback) + 7-slide JSON (v2)
      const slides = await generateContent('carousel', page.niche, story.title, retryOptions);

      let gptData = null;
      try {
        gptData = await generateContent('news_carousel', page.niche, story.title, retryOptions);
      } catch (gptErr) {
        console.warn('[carousel] Failed to generate 7-slide GPT data, will use legacy:', gptErr.message);
      }

      // Shared output folder for hook + carousel
      const newsFolder = getOutputFolder('news', story.title);

      // Post 1: hook image
      const hookPath    = await renderNewsHookImage(story, newsFolder);
      const hookCaption = `${story.hook_angle || story.title}.\nComment BREAKING below for the full breakdown 👇\n#AINews #ArtificialIntelligence #AITools #FutureOfAI #AIBreaking`;
      const hookUrl     = await upload(hookPath, page.id, retryOptions);
      await postImage({ igId: page.igAccountId, token, imageUrl: hookUrl, caption: hookCaption }, retryOptions);
      console.log('[' + page.name + '] Hook image posted');

      // Post 2: carousel — try v2 renderer, fall back to legacy on any error
      let carouselPaths;
      try {
        if (!gptData) throw new Error('No gptData available');
        carouselPaths = await renderNewsCarouselV2(story, gptData, newsFolder);
      } catch (err) {
        console.warn('[carousel] v2 failed, falling back to legacy:', err.message);
        carouselPaths = await renderNewsCarouselLegacy(
          { ...story, slides: Array.isArray(slides) ? slides : [] },
          gptData,
          newsFolder
        );
      }
      const imageUrls = [];
      for (const p of carouselPaths) {
        imageUrls.push(await upload(p, page.id, retryOptions));
      }

      // Use GPT-generated caption if available, otherwise fall back to caption generator
      const caption = (gptData && gptData.caption)
        ? gptData.caption
        : await generateCaption(page.niche, story.title, retryOptions);
      await postCarousel({ igId: page.igAccountId, token, imageUrls, caption }, retryOptions);
      markStoryPosted(story.title);
      console.log('[' + page.name + '] News carousel posted');

    } else if (format === 'resource-carousel') {
      console.log('[' + page.name + '] Building resource carousel...');
      const resource = await generateResourceCarousel();

      // generateResourceCarousel now renders images and returns paths
      const slidePaths = resource.paths || [];

      const imageUrls = [];
      for (const p of slidePaths) {
        imageUrls.push(await upload(p, page.id, retryOptions));
      }

      const caption = await generateCaption(
        page.niche,
        resource.hook_text || '',
        { ...retryOptions, caption_cta: resource.caption_cta }
      );
      await postCarousel({ igId: page.igAccountId, token, imageUrls, caption }, retryOptions);
      console.log('[' + page.name + '] Resource carousel posted');

    } else if (format === 'reel') {
      console.log('[' + page.name + '] Generating reel content...');
      const data = await generateContent('reel', page.niche, '', retryOptions);
      const frames = data.frames;

      // Render each frame as an image (1080x1920 for reels)
      const framePaths = [];
      for (let i = 0; i < frames.length; i++) {
        const framePath = `./reel_frame_${timestamp}_${i}.jpg`;
        await renderQuoteImage({
          text: frames[i],
          bgPath: bg,
          outputPath: framePath,
          config: page
        });
        framePaths.push(framePath);
      }

      const caption = await generateCaption(page.niche, frames[0], retryOptions);

      if (FFMPEG_AVAILABLE) {
        // Stitch frames into video
        const videoPath = `./reel_${timestamp}.mp4`;
        console.log('[' + page.name + '] Creating reel video with FFmpeg...');
        await createReelVideo(framePaths, videoPath);

        // Cleanup frame images
        framePaths.forEach(p => fs.existsSync(p) && fs.unlinkSync(p));

        // Upload video
        const videoUrl = await upload(videoPath, page.id, retryOptions);
        fs.unlinkSync(videoPath);

        // Post as reel
        await postReel({ igId: page.igAccountId, token, videoUrl, caption }, retryOptions);
        console.log('[' + page.name + '] Reel posted');
      } else {
        // Fallback: post first frame as image
        console.log('[' + page.name + '] FFmpeg not available, falling back to single image post');
        const imageUrl = await upload(framePaths[0], page.id, retryOptions);

        // Cleanup all frames
        framePaths.forEach(p => fs.existsSync(p) && fs.unlinkSync(p));

        await postImage({ igId: page.igAccountId, token, imageUrl, caption }, retryOptions);
        console.log('[' + page.name + '] Reel fallback image posted');
      }
    }
  } catch (err) {
    // Handle token limit gracefully - skip slot instead of crashing
    if (err instanceof TokenLimitExceededError) {
      console.warn(`[${page.name}] Skipping slot ${slotIndex}: Daily token limit reached`);
      logError({ page: page.name, slot: slotIndex, error: err });
      return;
    }
    logError({ page: page.name, slot: slotIndex, error: err });
    throw err;
  }
}

module.exports = { runSlot, pages };
