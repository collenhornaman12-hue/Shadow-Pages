module.exports = {
  apps: [
    {
      name: 'shadow-pages',
      script: 'scheduler.js',
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'research-scout',
      script: 'scripts/research-scout.js',
      cron_restart: '0 1,3,5 * * *',
      autorestart: false,
      watch: false,
    },
    {
      name: 'promote-learnings',
      script: 'scripts/promote-learnings.js',
      cron_restart: '0 9 * * 0',
      autorestart: false,
      watch: false,
    },
    {
      name: 'seed-bank-generator',
      script: 'scripts/seed-bank-generator.js',
      cron_restart: '0 2 1 * *',   // 2am on the 1st of every month
      autorestart: false,
      watch: false,
    },
    {
      name: 'shadow-pages-wealthy',
      script: 'orchestrator-wealthy.js',
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
