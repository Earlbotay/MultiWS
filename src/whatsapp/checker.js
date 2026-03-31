const waManager = require('./manager');

const sleep = ms => new Promise(r => setTimeout(r, ms));

class CheckerService {
  constructor() {
    console.log('[Checker] Servis penyemak nombor dimulakan');
  }

  async checkNumbers(deviceId, phones) {
    console.log(`[Checker] Menyemak ${phones.length} nombor menggunakan peranti ${deviceId}`);

    const socket = waManager.getSocket(deviceId);
    if (!socket) {
      throw new Error('Peranti tidak disambungkan');
    }

    const results = [];

    for (const phone of phones) {
      try {
        const jid = waManager.formatJid(phone);
        const result = await socket.onWhatsApp(jid);

        results.push({
          phone,
          exists: result[0]?.exists || false,
          jid: result[0]?.jid || null
        });

        console.log(`[Checker] ${phone}: ${result[0]?.exists ? 'Ada WhatsApp' : 'Tiada WhatsApp'}`);
      } catch (err) {
        results.push({
          phone,
          exists: false,
          jid: null,
          error: err.message
        });
        console.log(`[Checker] Ralat menyemak ${phone}: ${err.message}`);
      }

      // Kelewatan kecil antara semakan
      await sleep(500);
    }

    console.log(`[Checker] Semakan selesai. ${results.filter(r => r.exists).length}/${results.length} mempunyai WhatsApp`);
    return results;
  }

  async checkSingle(deviceId, phone) {
    console.log(`[Checker] Menyemak nombor tunggal: ${phone}`);

    const socket = waManager.getSocket(deviceId);
    if (!socket) {
      throw new Error('Peranti tidak disambungkan');
    }

    try {
      const jid = waManager.formatJid(phone);
      const result = await socket.onWhatsApp(jid);

      const exists = result[0]?.exists || false;
      console.log(`[Checker] ${phone}: ${exists ? 'Ada WhatsApp' : 'Tiada WhatsApp'}`);

      return {
        phone,
        exists,
        jid: result[0]?.jid || null
      };
    } catch (err) {
      console.log(`[Checker] Ralat menyemak ${phone}: ${err.message}`);
      throw err;
    }
  }
}

module.exports = new CheckerService();
