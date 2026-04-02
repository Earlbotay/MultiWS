const { db } = require('../database');
const { emit } = require('../events');
const { syncData } = require('../sync');
const WAManager = require('./manager');

// Map of active warmers: warmerId -> intervalId
const activeWarmers = new Map();

/**
 * Send a single warmer message
 * @param {object} warmer - warmer job row from DB
 * @param {object} session - WAManager session
 * @returns {boolean} success
 */
async function sendWarmerMessage(warmer, session) {
  const phone = warmer.target_phone.replace(/[^0-9]/g, '');
  const jid = `${phone}@s.whatsapp.net`;

  try {
    await session.socket.sendMessage(jid, { text: warmer.message });

    // Update warmer stats in DB
    db.prepare(
      'UPDATE warmer_jobs SET total_sent = total_sent + 1, last_sent = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(warmer.id);

    // Get updated warmer data
    const updated = db.prepare('SELECT total_sent, last_sent FROM warmer_jobs WHERE id = ?').get(warmer.id);

    // Save to messages table
    db.prepare(
      'INSERT INTO messages (device_id, remote_jid, from_me, message, timestamp, status) VALUES (?, ?, 1, ?, ?, ?)'
    ).run(warmer.device_id, jid, warmer.message, Math.floor(Date.now() / 1000), 'sent');

    emit(warmer.user_id, 'warmer-update', {
      warmerId: warmer.id,
      totalSent: updated.total_sent,
      lastSent: updated.last_sent
    });

    console.log(`[Warmer] Sent message for warmer ${warmer.id} to ${phone} (total: ${updated.total_sent})`);
    syncData();
    return true;
  } catch (err) {
    console.error(`[Warmer] Failed to send for warmer ${warmer.id} to ${phone}:`, err.message);
    return false;
  }
}

/**
 * Calculate a random interval between min and max (minutes -> milliseconds)
 * @param {number} intervalMin - minimum interval in minutes
 * @param {number} intervalMax - maximum interval in minutes
 * @returns {number} interval in milliseconds
 */
function randomInterval(intervalMin, intervalMax) {
  const min = (intervalMin || 30) * 60 * 1000;
  const max = (intervalMax || 60) * 60 * 1000;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Start a warmer job — sends messages at random intervals
 * @param {number} warmerId
 */
async function startWarmer(warmerId) {
  // Stop existing warmer if running
  if (activeWarmers.has(warmerId)) {
    clearInterval(activeWarmers.get(warmerId));
    activeWarmers.delete(warmerId);
  }

  const warmer = db.prepare('SELECT * FROM warmer_jobs WHERE id = ?').get(warmerId);
  if (!warmer) {
    throw new Error(`Warmer job ${warmerId} not found`);
  }

  const manager = WAManager.getInstance();
  const session = manager.getSession(warmer.device_id);

  if (!session || !session.socket) {
    db.prepare("UPDATE warmer_jobs SET status = 'stopped' WHERE id = ?").run(warmerId);
    throw new Error(`Device ${warmer.device_id} is not connected`);
  }

  // Update status to active
  db.prepare("UPDATE warmer_jobs SET status = 'active' WHERE id = ?").run(warmerId);

  // Send first message immediately
  await sendWarmerMessage(warmer, session);

  // Set up recurring interval with random timing
  const scheduleNext = () => {
    const interval = randomInterval(warmer.interval_min, warmer.interval_max);
    console.log(`[Warmer] Next message for warmer ${warmerId} in ${Math.round(interval / 60000)} minutes`);

    const timeoutId = setTimeout(async () => {
      // Verify warmer is still active
      const current = db.prepare('SELECT status, device_id FROM warmer_jobs WHERE id = ?').get(warmerId);
      if (!current || current.status !== 'active') {
        activeWarmers.delete(warmerId);
        return;
      }

      // Verify device is still connected
      const currentSession = manager.getSession(current.device_id);
      if (!currentSession || !currentSession.socket) {
        console.error(`[Warmer] Device ${current.device_id} disconnected, stopping warmer ${warmerId}`);
        db.prepare("UPDATE warmer_jobs SET status = 'stopped' WHERE id = ?").run(warmerId);
        activeWarmers.delete(warmerId);
        return;
      }

      await sendWarmerMessage(warmer, currentSession);

      // Schedule next message if still in map
      if (activeWarmers.has(warmerId)) {
        scheduleNext();
      }
    }, interval);

    activeWarmers.set(warmerId, timeoutId);
  };

  scheduleNext();
  console.log(`[Warmer] Started warmer ${warmerId}`);
}

/**
 * Stop a warmer job permanently
 * @param {number} warmerId
 */
function stopWarmer(warmerId) {
  const timerId = activeWarmers.get(warmerId);
  if (timerId) {
    clearTimeout(timerId);
    activeWarmers.delete(warmerId);
  }

  db.prepare("UPDATE warmer_jobs SET status = 'stopped' WHERE id = ?").run(warmerId);
  console.log(`[Warmer] Stopped warmer ${warmerId}`);
}

/**
 * Pause a warmer job (can be resumed later)
 * @param {number} warmerId
 */
function pauseWarmer(warmerId) {
  const timerId = activeWarmers.get(warmerId);
  if (timerId) {
    clearTimeout(timerId);
    activeWarmers.delete(warmerId);
  }

  db.prepare("UPDATE warmer_jobs SET status = 'paused' WHERE id = ?").run(warmerId);
  console.log(`[Warmer] Paused warmer ${warmerId}`);
}

module.exports = { startWarmer, stopWarmer, pauseWarmer, activeWarmers };
