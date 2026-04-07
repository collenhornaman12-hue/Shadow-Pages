require('dotenv').config();
const { postImage } = require('./modules/instagram-publisher');

async function test() {
  await postImage({
    igId: process.env.IG_ACCOUNT_ID_CUTTINGEDGE,
    token: process.env.IG_TOKEN_CUTTINGEDGE,
    imageUrl: 'https://res.cloudinary.com/dbqu7xgib/image/upload/v1774149414/shadow-pages/wrs0yet2kqxfpgwsqqpw.jpg',
    caption: 'AI will not replace you. A person using AI will. 🤖\n\n#AI #Productivity #FutureOfWork'
  });
}

test().catch(console.error);
