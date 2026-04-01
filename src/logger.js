const fs = require('fs');
const path = require('path');
const config = require('./config');

const logFile = path.join(config.LOG_DIR, 'multichat.log');

function getTimestamp() {
  return new Date().toLocaleString('ms-MY', { timeZone: 'Asia/Kuala_Lumpur' });
}

function writeLog(level, ...args) {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  const line = `[${getTimestamp()}] [${level}] ${msg}\n`;
  try {
    fs.appendFileSync(logFile, line);
  } catch (e) {}
}

// Override console methods to also write to file
const origLog = console.log;
const origError = console.error;
const origWarn = console.warn;

console.log = (...args) => { origLog(...args); writeLog('INFO', ...args); };
console.error = (...args) => { origError(...args); writeLog('ERROR', ...args); };
console.warn = (...args) => { origWarn(...args); writeLog('WARN', ...args); };

module.exports = { writeLog };
