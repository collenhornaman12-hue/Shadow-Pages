require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const { withRetry } = require('./retry');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key:    process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET,
});

async function upload(localPath, folder = 'shadow-pages', options = {}) {
  return withRetry(async () => {
    const result = await cloudinary.uploader.upload(localPath, {
      folder,
      resource_type: 'auto',
    });
    return result.secure_url;
  }, { label: 'Cloudinary', ...options });
}

module.exports = { upload };
