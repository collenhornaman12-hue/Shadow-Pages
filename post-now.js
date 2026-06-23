// post-now.js — self-contained: Cloudinary upload → IG container → IG publish
// Run with: node post-now.js

require('dotenv').config();
const path = require('path');
const cloudinary = require('cloudinary').v2;

// ─── Config ───────────────────────────────────────────────────────────────────

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key:    process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET,
});

const IG_USER_ID = process.env.IG_ACCOUNT_ID_CUTTINGEDGE;
const IG_TOKEN   = process.env.IG_TOKEN_CUTTINGEDGE;
const IG_BASE    = 'https://graph.facebook.com/v25.0';

const IMAGE_PATH = path.join(__dirname, 'test-quote-new.jpg');
const CAPTION    = 'Your competitor uses AI. You use Google.';

// ─── Step 1: Upload to Cloudinary ─────────────────────────────────────────────

async function uploadToCloudinary(filePath) {
  console.log('[1/3] Uploading to Cloudinary...');
  const result = await cloudinary.v2.uploader.upload(filePath, {
    folder: 'shadow-pages',
    resource_type: 'image',
  });
  console.log('      secure_url:', result.secure_url);
  return result.secure_url;
}

// ─── Step 2: Create IG media container ────────────────────────────────────────

async function createContainer(imageUrl, caption) {
  console.log('[2/3] Creating Instagram media container...');
  const res = await fetch(`${IG_BASE}/${IG_USER_ID}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url:    imageUrl,
      caption:      caption,
      access_token: IG_TOKEN,
    }),
  });
  const data = await res.json();
  if (data.error) {
    throw new Error('Container creation failed: ' + JSON.stringify(data.error));
  }
  console.log('      Container ID:', data.id);

  // Poll until FINISHED (max 2 min)
  console.log('      Waiting for container to process...');
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const poll = await fetch(
      `${IG_BASE}/${data.id}?fields=status_code&access_token=${IG_TOKEN}`
    );
    const status = await poll.json();
    if (status.status_code === 'FINISHED') break;
    if (status.status_code === 'ERROR') {
      throw new Error('Container processing error: ' + JSON.stringify(status));
    }
    await new Promise(r => setTimeout(r, 5000));
  }
  console.log('      Container ready.');
  return data.id;
}

// ─── Step 3: Publish ──────────────────────────────────────────────────────────

async function publishContainer(containerId) {
  console.log('[3/3] Publishing...');
  const res = await fetch(`${IG_BASE}/${IG_USER_ID}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id:  containerId,
      access_token: IG_TOKEN,
    }),
  });
  const data = await res.json();
  if (data.error) {
    throw new Error('Publish failed: ' + JSON.stringify(data.error));
  }
  return data.id;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  try {
    const imageUrl    = await uploadToCloudinary(IMAGE_PATH);
    const containerId = await createContainer(imageUrl, CAPTION);
    const postId      = await publishContainer(containerId);
    console.log('\n✓ Post published. Instagram Media ID:', postId);
  } catch (err) {
    console.error('\n✗ Failed:', err.message);
    console.error(err.stack);
      process.exit(1);
  }
})();
