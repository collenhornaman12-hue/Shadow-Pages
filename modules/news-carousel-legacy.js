'use strict';
// Legacy news carousel renderer — do not modify.
// Wraps the original renderNewsCarousel from image-renderer.js.
// Called as fallback when the v2 renderer fails.

const { renderNewsCarousel } = require('./image-renderer');

async function renderNewsCarouselLegacy(story, _gptData, outputFolder = null) {
  return renderNewsCarousel(story, outputFolder);
}

module.exports = { renderNewsCarouselLegacy };
