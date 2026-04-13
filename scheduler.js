require('dotenv').config();
const cron = require('node-cron');
const { runSlot, pages } = require('./orchestrator');

console.log('Shadow Pages Scheduler starting...');

pages.forEach(function(page) {
  page.postSchedule.forEach(function(time, slotIndex) {
    const parts = time.split(':');
    const hour = Number(parts[0]);
    const min = Number(parts[1]);
    const jitter = Math.floor(Math.random() * 10) - 5;
    const adjMin = Math.max(0, Math.min(59, min + jitter));
    const expr = adjMin + ' ' + hour + ' * * *';

    cron.schedule(expr, async function() {
      const adjMinStr = String(adjMin).padStart(2, '0');
      console.log('[' + page.name + '] Firing slot ' + slotIndex + ' at ' + hour + ':' + adjMinStr);
      console.log('[SCHEDULER] Slot fired:', page.name, 'slot', slotIndex, new Date().toISOString());
      try {
        await runSlot(page, slotIndex);
      } catch (err) {
        console.error('[' + page.name + '] Error in slot ' + slotIndex + ':', err.message);
      }
    });

    const adjMinStr = String(adjMin).padStart(2, '0');
    console.log('Scheduled [' + page.name + '] slot ' + slotIndex + ' at ' + hour + ':' + adjMinStr);
  });
});

console.log('Scheduler running. Press Ctrl+C to stop.');