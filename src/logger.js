'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config');

// ── Log file path ──
const logFile = path.join(config.DATA_DIR, 'logs', 'multichat.log');

// ── Save original console methods ──
const originalLog = console.log.bind(console);
const originalError = console.error.bind(console);
const originalWarn = console.warn.bind(console);

/**
 * Get formatted timestamp in Asia/Kuala_Lumpur timezone.
 * Format: YYYY-MM-DD HH:mm:ss
 * @returns {string}
 */
function getTimestamp() {
  return new Date().toLocaleString('sv-SE', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).replace(',', '');
}

/**
 * Format arguments into a single string.
 * @param {any[]} args
 * @returns {string}
 */
function formatArgs(args) {
  return args.map(arg => {
    if (typeof arg === 'object' && arg !== null) {
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');
}

/**
 * Write a log entry to the log file.
 * @param {string} level
 * @param {string} message
 */
function writeToFile(level, message) {
  const entry = `[${getTimestamp()}] [${level}] ${message}\n`;
  try {
    fs.appendFileSync(logFile, entry, 'utf8');
  } catch (err) {
    // If writing to log file fails, output to original stderr
    originalError(`[LOGGER] Gagal menulis ke fail log: ${err.message}`);
  }
}

// ── Override console.log ──
console.log = function (...args) {
  const message = formatArgs(args);
  writeToFile('INFO', message);
  originalLog(...args);
};

// ── Override console.error ──
console.error = function (...args) {
  const message = formatArgs(args);
  writeToFile('ERROR', message);
  originalError(...args);
};

// ── Override console.warn ──
console.warn = function (...args) {
  const message = formatArgs(args);
  writeToFile('WARN', message);
  originalWarn(...args);
};

console.log('[LOGGER] Sistem logging dimulakan. Log file:', logFile);
