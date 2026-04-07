require('dotenv').config();
const { withRetry } = require('./retry');

const BASE = 'https://graph.facebook.com/v25.0';

async function waitForContainer(containerId, token, maxWait = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const r = await fetch(`${BASE}/${containerId}?fields=status_code&access_token=${token}`);
    const d = await r.json();
    if (d.status_code === 'FINISHED') return true;
    if (d.status_code === 'ERROR') throw new Error('Container error: ' + JSON.stringify(d));
    await new Promise(res => setTimeout(res, 5000));
  }
  throw new Error('Container timed out');
}

async function postImage({ igId, token, imageUrl, caption }, options = {}) {
  return withRetry(async () => {
    console.log('Creating media container...');
    const createRes = await fetch(`${BASE}/${igId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl, caption, access_token: token })
    });
    const createData = await createRes.json();
    if (createData.error) throw new Error('Create error: ' + JSON.stringify(createData.error));

    const containerId = createData.id;
    console.log('Container created:', containerId);
    console.log('Waiting for container to finish processing...');
    await waitForContainer(containerId, token);

    console.log('Publishing...');
    const pubRes = await fetch(`${BASE}/${igId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: containerId, access_token: token })
    });
    const pubData = await pubRes.json();
    if (pubData.error) throw new Error('Publish error: ' + JSON.stringify(pubData.error));

    console.log('✓ Posted successfully. Media ID:', pubData.id);
    return pubData;
  }, { label: 'Instagram:postImage', ...options });
}

async function postCarousel({ igId, token, imageUrls, caption }, options = {}) {
  return withRetry(async () => {
    console.log('Creating carousel child containers...');
    const childIds = [];
    for (const url of imageUrls) {
      const r = await fetch(`${BASE}/${igId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: url, is_carousel_item: true, access_token: token })
      });
      const d = await r.json();
      if (d.error) throw new Error('Child container error: ' + JSON.stringify(d.error));
      await waitForContainer(d.id, token);
      childIds.push(d.id);
      console.log('Child container ready:', d.id);
    }

    console.log('Creating carousel container...');
    const carRes = await fetch(`${BASE}/${igId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ media_type: 'CAROUSEL', children: childIds.join(','), caption, access_token: token })
    });
    const carData = await carRes.json();
    if (carData.error) throw new Error('Carousel container error: ' + JSON.stringify(carData.error));

    await waitForContainer(carData.id, token);

    console.log('Publishing carousel...');
    const pubRes = await fetch(`${BASE}/${igId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: carData.id, access_token: token })
    });
    const pubData = await pubRes.json();
    if (pubData.error) throw new Error('Carousel publish error: ' + JSON.stringify(pubData.error));

    console.log('✓ Carousel posted. Media ID:', pubData.id);
    return pubData;
  }, { label: 'Instagram:postCarousel', ...options });
}

async function postReel({ igId, token, videoUrl, caption, coverUrl = null }, options = {}) {
  return withRetry(async () => {
    console.log('Creating reel container...');
    const body = {
      media_type: 'REELS',
      video_url: videoUrl,
      caption,
      access_token: token
    };
    if (coverUrl) {
      body.cover_url = coverUrl;
    }

    const createRes = await fetch(`${BASE}/${igId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const createData = await createRes.json();
    if (createData.error) throw new Error('Reel create error: ' + JSON.stringify(createData.error));

    const containerId = createData.id;
    console.log('Reel container created:', containerId);
    console.log('Waiting for reel to finish processing...');
    await waitForContainer(containerId, token, 300000); // 5 min timeout for video

    console.log('Publishing reel...');
    const pubRes = await fetch(`${BASE}/${igId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: containerId, access_token: token })
    });
    const pubData = await pubRes.json();
    if (pubData.error) throw new Error('Reel publish error: ' + JSON.stringify(pubData.error));

    console.log('✓ Reel posted. Media ID:', pubData.id);
    return pubData;
  }, { label: 'Instagram:postReel', ...options });
}

module.exports = { postImage, postCarousel, postReel };
