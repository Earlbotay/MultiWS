const { db } = require('../database');
const WAManager = require('./manager');

// Track when devices connected (for uptime calculation)
const connectTimes = new Map(); // deviceId -> timestamp

/**
 * Record a device connection time (called when device connects)
 * @param {number} deviceId
 */
function recordConnect(deviceId) {
  connectTimes.set(deviceId, Date.now());
}

/**
 * Remove a device connection time (called when device disconnects)
 * @param {number} deviceId
 */
function recordDisconnect(deviceId) {
  connectTimes.delete(deviceId);
}

/**
 * Get status and stats for a specific device
 * @param {number} deviceId
 * @returns {object} { connected, uptime, messagesSent }
 */
function getDeviceStatus(deviceId) {
  const manager = WAManager.getInstance();
  const connected = manager.isConnected(deviceId);

  // Calculate uptime
  let uptime = 0;
  if (connected && connectTimes.has(deviceId)) {
    uptime = Math.floor((Date.now() - connectTimes.get(deviceId)) / 1000);
  }

  // Count messages sent from this device
  const msgResult = db.prepare(
    'SELECT COUNT(*) as count FROM messages WHERE device_id = ? AND from_me = 1'
  ).get(deviceId);

  return {
    connected,
    uptime,
    messagesSent: msgResult ? msgResult.count : 0
  };
}

/**
 * Get aggregate stats for a specific user
 * @param {number} userId
 * @returns {object} { totalDevices, connectedDevices, totalMessages, activeAutoReplies }
 */
function getUserStats(userId) {
  const totalDevices = db.prepare(
    'SELECT COUNT(*) as count FROM devices WHERE user_id = ?'
  ).get(userId);

  const connectedDevices = db.prepare(
    "SELECT COUNT(*) as count FROM devices WHERE user_id = ? AND status = 'connected'"
  ).get(userId);

  const totalMessages = db.prepare(
    'SELECT COUNT(*) as count FROM messages WHERE device_id IN (SELECT id FROM devices WHERE user_id = ?)'
  ).get(userId);

  const activeAutoReplies = db.prepare(
    'SELECT COUNT(*) as count FROM auto_replies WHERE user_id = ? AND is_active = 1'
  ).get(userId);

  return {
    totalDevices: totalDevices ? totalDevices.count : 0,
    connectedDevices: connectedDevices ? connectedDevices.count : 0,
    totalMessages: totalMessages ? totalMessages.count : 0,
    activeAutoReplies: activeAutoReplies ? activeAutoReplies.count : 0
  };
}

/**
 * Get system-wide stats (for admin)
 * @returns {object} { totalUsers, totalDevices, connectedDevices, totalMessages }
 */
function getSystemStats() {
  const totalUsers = db.prepare(
    'SELECT COUNT(*) as count FROM users'
  ).get();

  const totalDevices = db.prepare(
    'SELECT COUNT(*) as count FROM devices'
  ).get();

  const connectedDevices = db.prepare(
    "SELECT COUNT(*) as count FROM devices WHERE status = 'connected'"
  ).get();

  const totalMessages = db.prepare(
    'SELECT COUNT(*) as count FROM messages'
  ).get();

  return {
    totalUsers: totalUsers ? totalUsers.count : 0,
    totalDevices: totalDevices ? totalDevices.count : 0,
    connectedDevices: connectedDevices ? connectedDevices.count : 0,
    totalMessages: totalMessages ? totalMessages.count : 0
  };
}

module.exports = {
  getDeviceStatus,
  getUserStats,
  getSystemStats,
  recordConnect,
  recordDisconnect
};
