const { generateContent } = require('./content-generator');

async function generateCaption(niche, postText, options = {}) {
  const result = await generateContent('caption', niche, postText, options);
  const caption  = result.caption || '';
  const hashtags = (result.hashtags || [])
    .map(h => h.trim().startsWith('#') ? h.trim() : '#' + h.trim())
    .join(' ');
  let full = `${caption}\n\n${hashtags}`;
  if (options.caption_cta) {
    full += `\n${options.caption_cta}`;
  }
  return full;
}

module.exports = { generateCaption };
