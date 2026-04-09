module.exports = {
  cuttingedgeofai: {
    igAccountId: process.env.IG_ACCOUNT_ID_CUTTINGEDGE,
    igToken: process.env.IG_TOKEN_CUTTINGEDGE,
    handle: '@cuttingedgeofai',
    niche: 'ai',
    storeLink: 'stan.store/cuttingedgeofai',
    soulFile: 'SOUL.md',
    audienceFile: 'memory/AUDIENCE_PSYCHOLOGY_AI.md',
    newsFeeds: [
      'https://techcrunch.com/feed/',
      'https://www.theverge.com/rss/index.xml',
      'https://www.wired.com/feed/rss'
    ],
    schedule: {
      viralDemo: '0 7 * * *',
      newsCarouselMorning: '0 12 * * *',
      resourceCarousel: '0 18 * * *',
      newsCarouselEvening: '0 21 * * *'
    }
  },
  wealthyedge: {
    igAccountId: process.env.IG_ACCOUNT_ID_WEALTHYEDGE,
    igToken: process.env.IG_TOKEN_WEALTHYEDGE,
    handle: '@edgeofthewealthy',
    niche: 'wealth',
    storeLink: 'stan.store/cuttingedgeofai',
    soulFile: 'SOUL.md',
    audienceFile: 'memory/AUDIENCE_PSYCHOLOGY_WEALTHY.md',
    newsFeeds: [
      'https://feeds.bloomberg.com/markets/news.rss',
      'https://markets.businessinsider.com/rss/news',
      'https://www.forbes.com/real-time/feed2/'
    ],
    newsFeedsFallback: [
      'https://finance.yahoo.com/rss/',
      'https://www.cnbc.com/id/10000664/device/rss/rss.html'
    ],
    schedule: {
      viralDemo: '0 8 * * *',
      newsCarouselMorning: '0 13 * * *',
      resourceCarousel: '0 17 * * *',
      newsCarouselEvening: '0 20 * * *'
    }
  }
};
