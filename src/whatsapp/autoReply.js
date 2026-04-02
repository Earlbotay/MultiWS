const { db } = require('../database');
const WAManager = require('./manager');

/**
 * Process auto-reply rules for an incoming message
 * @param {number} deviceId - the device that received the message
 * @param {object} message - raw Baileys message object
 * @param {string} remoteJid - the sender's JID
 */
async function processAutoReply(deviceId, message, remoteJid) {
  try {
    // Get device to find user_id
    const device = db.prepare('SELECT user_id FROM devices WHERE id = ?').get(deviceId);
    if (!device) return;

    // Get active auto-reply rules for this user
    // Rules where device_id matches this device OR device_id IS NULL (applies to all devices)
    const rules = db.prepare(`
      SELECT * FROM auto_replies
      WHERE user_id = ? AND is_active = 1
        AND (device_id = ? OR device_id IS NULL)
      ORDER BY id ASC
    `).all(device.user_id, deviceId);

    if (rules.length === 0) return;

    // Extract text from message object
    const text = message.message?.conversation
      || message.message?.extendedTextMessage?.text
      || message.message?.imageMessage?.caption
      || message.message?.videoMessage?.caption
      || '';

    if (!text) return;

    const textLower = text.toLowerCase().trim();

    // Check each rule for a match (first match wins)
    for (const rule of rules) {
      const triggerLower = rule.trigger_word.toLowerCase().trim();
      let matched = false;

      switch (rule.match_type) {
        case 'exact':
          matched = textLower === triggerLower;
          break;
        case 'contains':
          matched = textLower.includes(triggerLower);
          break;
        case 'startsWith':
          matched = textLower.startsWith(triggerLower);
          break;
        default:
          matched = textLower.includes(triggerLower);
          break;
      }

      if (matched) {
        // Get WAManager session to send reply
        const manager = WAManager.getInstance();
        const session = manager.getSession(deviceId);

        if (!session || !session.socket) {
          console.error(`[AutoReply] Device ${deviceId} not connected, cannot send reply`);
          return;
        }

        try {
          // Send the auto-reply response
          await session.socket.sendMessage(remoteJid, { text: rule.response });

          // Save the auto-reply message to messages table
          db.prepare(
            'INSERT INTO messages (device_id, remote_jid, from_me, message, timestamp, status) VALUES (?, ?, 1, ?, ?, ?)'
          ).run(deviceId, remoteJid, rule.response, Math.floor(Date.now() / 1000), 'sent');

          console.log(`[AutoReply] Replied to ${remoteJid} on device ${deviceId} (rule: ${rule.id}, trigger: "${rule.trigger_word}")`);
        } catch (err) {
          console.error(`[AutoReply] Failed to send reply to ${remoteJid}:`, err.message);
        }

        // Break after first match — don't send multiple replies
        return;
      }
    }
  } catch (err) {
    console.error(`[AutoReply] Error processing auto-reply for device ${deviceId}:`, err.message);
  }
}

module.exports = { processAutoReply };
