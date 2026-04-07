const { logError } = require('./logger');

const DEFAULT_DELAYS = [5000, 15000]; // 5s, then 15s (3 attempts total)

async function withRetry(fn, { label, delays = DEFAULT_DELAYS, page = 'system', slot = '-' } = {}) {
  const maxAttempts = delays.length + 1;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.error(`[${label}] Attempt ${attempt}/${maxAttempts} failed:`, error.message);

      if (attempt < maxAttempts) {
        const delay = delays[attempt - 1];
        console.log(`[${label}] Waiting ${delay / 1000}s before retry...`);
        await new Promise(res => setTimeout(res, delay));
      }
    }
  }

  logError({ page, slot, error: new Error(`[${label}] All ${maxAttempts} attempts failed: ${lastError.message}`) });
  throw lastError;
}

module.exports = { withRetry };
