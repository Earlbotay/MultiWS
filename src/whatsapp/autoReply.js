const db = require('../database');
const waManager = require('./manager');

class AutoReplyService {
  constructor() {
    console.log('[AutoReply] Servis auto-reply dimulakan');
    this.init();
  }

  init() {
    console.log('[AutoReply] Mendaftarkan pengendali mesej untuk auto-reply');

    waManager.registerMessageHandler(async (deviceId, message) => {
      try {
        // Abaikan mesej yang dihantar sendiri
        if (message.key.fromMe) return;

        const messageText = message.message?.conversation
          || message.message?.extendedTextMessage?.text
          || '';

        if (!messageText) return;

        // Dapatkan peranti dari pangkalan data
        const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(deviceId);
        if (!device) return;

        // Dapatkan peraturan auto-reply yang aktif untuk peranti ini
        const rules = db.prepare(
          'SELECT * FROM auto_replies WHERE device_id = ? AND is_active = 1 ORDER BY id ASC'
        ).all(deviceId);

        if (rules.length === 0) return;

        const msgLower = messageText.toLowerCase();

        for (const rule of rules) {
          const triggerLower = rule.trigger_word.toLowerCase();
          let matched = false;

          if (rule.match_type === 'exact') {
            matched = msgLower === triggerLower;
          } else if (rule.match_type === 'contains') {
            matched = msgLower.includes(triggerLower);
          } else if (rule.match_type === 'startswith') {
            matched = msgLower.startsWith(triggerLower);
          }

          if (matched) {
            const senderJid = message.key.remoteJid;
            console.log(`[AutoReply] Padanan dijumpai untuk peranti ${deviceId}: "${rule.trigger_word}" -> menghantar balasan ke ${senderJid}`);

            await waManager.sendMessage(deviceId, senderJid, { text: rule.reply_message });
            console.log(`[AutoReply] Balasan berjaya dihantar ke ${senderJid}`);
            break; // Hanya padankan peraturan pertama
          }
        }
      } catch (err) {
        console.log(`[AutoReply] Ralat memproses mesej: ${err.message}`);
      }
    });

    console.log('[AutoReply] Pengendali mesej berjaya didaftarkan');
  }

  createRule(userId, deviceId, triggerWord, replyMessage, matchType) {
    console.log(`[AutoReply] Mencipta peraturan auto-reply: "${triggerWord}" (${matchType})`);

    const result = db.prepare(`
      INSERT INTO auto_replies (user_id, device_id, trigger_word, reply_message, match_type, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(userId, deviceId, triggerWord, replyMessage, matchType || 'contains');

    const rule = db.prepare('SELECT * FROM auto_replies WHERE id = ?').get(result.lastInsertRowid);
    console.log(`[AutoReply] Peraturan #${rule.id} berjaya dicipta`);
    return rule;
  }

  updateRule(ruleId, triggerWord, replyMessage, matchType, isActive) {
    console.log(`[AutoReply] Mengemaskini peraturan #${ruleId}`);

    db.prepare(`
      UPDATE auto_replies 
      SET trigger_word = ?, reply_message = ?, match_type = ?, is_active = ?
      WHERE id = ?
    `).run(triggerWord, replyMessage, matchType, isActive ? 1 : 0, ruleId);

    return db.prepare('SELECT * FROM auto_replies WHERE id = ?').get(ruleId);
  }

  deleteRule(ruleId) {
    console.log(`[AutoReply] Memadam peraturan #${ruleId}`);
    db.prepare('DELETE FROM auto_replies WHERE id = ?').run(ruleId);
  }

  getRules(userId, deviceId) {
    if (deviceId) {
      console.log(`[AutoReply] Mendapatkan peraturan untuk peranti ${deviceId}`);
      return db.prepare(
        'SELECT * FROM auto_replies WHERE user_id = ? AND device_id = ? ORDER BY id DESC'
      ).all(userId, deviceId);
    }

    console.log(`[AutoReply] Mendapatkan semua peraturan untuk pengguna ${userId}`);
    return db.prepare(
      'SELECT * FROM auto_replies WHERE user_id = ? ORDER BY id DESC'
    ).all(userId);
  }

  toggleRule(ruleId) {
    console.log(`[AutoReply] Menukar status peraturan #${ruleId}`);

    const rule = db.prepare('SELECT * FROM auto_replies WHERE id = ?').get(ruleId);
    if (!rule) {
      throw new Error('Peraturan tidak dijumpai');
    }

    const newStatus = rule.is_active ? 0 : 1;
    db.prepare('UPDATE auto_replies SET is_active = ? WHERE id = ?').run(newStatus, ruleId);

    console.log(`[AutoReply] Peraturan #${ruleId} kini ${newStatus ? 'aktif' : 'tidak aktif'}`);
    return db.prepare('SELECT * FROM auto_replies WHERE id = ?').get(ruleId);
  }
}

module.exports = new AutoReplyService();
