const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, '..', 'logs');
const ERROR_LOG = path.join(LOGS_DIR, 'errors.log');

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function logError({ page = 'system', slot = '-', error }) {
  ensureLogsDir();
  const timestamp = new Date().toISOString();
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : '';
  const line = `[${timestamp}] [${page}] [slot:${slot}] ${message}\n${stack ? stack + '\n' : ''}`;

  fs.appendFileSync(ERROR_LOG, line);
  console.error(line.trim());
}

module.exports = { logError };
