const { db } = require('../database');
const { syncData } = require('../sync');
const WAManager = require('./manager');

/**
 * Check if a single phone number is registered on WhatsApp
 * @param {number} deviceId - device to use for checking
 * @param {string} phone - phone number to check
 * @returns {object} { phone, exists, jid }
 */
async function checkNumber(deviceId, phone) {
  const manager = WAManager.getInstance();
  const session = manager.getSession(deviceId);

  if (!session || !session.socket) {
    throw new Error(`Device ${deviceId} is not connected`);
  }

  // Clean phone number (digits only)
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const jid = `${cleanPhone}@s.whatsapp.net`;

  try {
    const result = await session.socket.onWhatsApp(jid);

    const exists = result && result.length > 0 && result[0].exists;
    const resultJid = (result && result.length > 0) ? result[0].jid : jid;

    return {
      phone: cleanPhone,
      exists: !!exists,
      jid: resultJid
    };
  } catch (err) {
    console.error(`[Checker] Error checking ${cleanPhone}:`, err.message);
    return {
      phone: cleanPhone,
      exists: false,
      jid
    };
  }
}

/**
 * Check multiple phone numbers in bulk
 * @param {number} deviceId - device to use for checking
 * @param {string[]} phones - array of phone numbers to check
 * @param {number} userId - user who initiated the check
 * @returns {object[]} array of { phone, exists, jid }
 */
async function checkBulk(deviceId, phones, userId) {
  const results = [];

  // Prepare upsert statement for contacts
  const upsertContact = db.prepare(`
    INSERT INTO contacts (user_id, phone, has_whatsapp, created_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, phone) DO UPDATE SET has_whatsapp = excluded.has_whatsapp
  `);

  for (const phone of phones) {
    const result = await checkNumber(deviceId, phone);
    results.push(result);

    // Update contacts table
    try {
      upsertContact.run(userId, result.phone, result.exists ? 1 : 0);
    } catch (err) {
      console.error(`[Checker] Error saving contact ${result.phone}:`, err.message);
    }

    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log(`[Checker] Bulk check completed: ${results.length} numbers, ${results.filter(r => r.exists).length} on WhatsApp`);
  syncData();

  return results;
}

module.exports = { checkNumber, checkBulk };
