const db = require('../database');
const waManager = require('./manager');

class WarmerService {
  constructor() {
    this.activeWarmers = new Map();
    console.log('[Warmer] Servis warmer dimulakan');
  }

  createSession(userId, deviceIds, messages, intervalMin, intervalMax) {
    console.log(`[Warmer] Mencipta sesi warmer dengan ${deviceIds.length} peranti`);

    const messagesJson = JSON.stringify(messages);

    const result = db.prepare(`
      INSERT INTO warmer_sessions (user_id, messages, interval_min, interval_max, status)
      VALUES (?, ?, ?, ?, 'stopped')
    `).run(userId, messagesJson, intervalMin, intervalMax);

    const warmerId = result.lastInsertRowid;

    const insertDevice = db.prepare(
      'INSERT INTO warmer_devices (warmer_id, device_id) VALUES (?, ?)'
    );

    const insertMany = db.transaction((ids) => {
      for (const deviceId of ids) {
        insertDevice.run(warmerId, deviceId);
      }
    });

    insertMany(deviceIds);

    const session = db.prepare('SELECT * FROM warmer_sessions WHERE id = ?').get(warmerId);
    console.log(`[Warmer] Sesi warmer #${warmerId} berjaya dicipta`);
    return session;
  }

  async startWarmer(warmerId) {
    const session = db.prepare('SELECT * FROM warmer_sessions WHERE id = ?').get(warmerId);
    if (!session) {
      throw new Error('Sesi warmer tidak dijumpai');
    }

    console.log(`[Warmer] Memulakan warmer #${warmerId}`);
    db.prepare('UPDATE warmer_sessions SET status = ? WHERE id = ?').run('running', warmerId);

    const devices = db.prepare('SELECT * FROM warmer_devices WHERE warmer_id = ?').all(warmerId);
    const messages = JSON.parse(session.messages);

    if (devices.length < 2) {
      throw new Error('Sekurang-kurangnya 2 peranti diperlukan untuk warmer');
    }

    const warmerState = { timeout: null, running: true };
    this.activeWarmers.set(warmerId, warmerState);

    const runIteration = async () => {
      if (!warmerState.running) return;

      try {
        // Pilih 2 peranti secara rawak
        const shuffled = [...devices].sort(() => Math.random() - 0.5);
        const deviceA = shuffled[0];
        const deviceB = shuffled[1];

        // Pilih mesej secara rawak
        const message = messages[Math.floor(Math.random() * messages.length)];

        // Dapatkan maklumat peranti B untuk nombor telefon
        const deviceBInfo = db.prepare('SELECT * FROM devices WHERE id = ?').get(deviceB.device_id);

        if (deviceBInfo && deviceBInfo.phone) {
          const jid = waManager.formatJid(deviceBInfo.phone);
          const statusA = waManager.getStatus(deviceA.device_id);
          const statusB = waManager.getStatus(deviceB.device_id);

          if (statusA === 'connected' && statusB === 'connected') {
            await waManager.sendMessage(deviceA.device_id, jid, { text: message });
            console.log(`[Warmer] Mesej dihantar dari peranti ${deviceA.device_id} ke peranti ${deviceB.device_id}`);
          } else {
            console.log(`[Warmer] Peranti tidak disambungkan. A: ${statusA}, B: ${statusB}`);
          }
        } else {
          console.log(`[Warmer] Maklumat peranti B tidak dijumpai atau tiada nombor telefon`);
        }
      } catch (err) {
        console.log(`[Warmer] Ralat semasa iterasi warmer #${warmerId}: ${err.message}`);
      }

      // Jadualkan iterasi seterusnya
      if (warmerState.running) {
        const intervalMin = session.interval_min || 30;
        const intervalMax = session.interval_max || 60;
        const delay = Math.floor(Math.random() * (intervalMax - intervalMin + 1)) + intervalMin;
        console.log(`[Warmer] Iterasi seterusnya dalam ${delay} saat`);
        warmerState.timeout = setTimeout(runIteration, delay * 1000);
      }
    };

    // Mulakan iterasi pertama
    runIteration();
  }

  stopWarmer(warmerId) {
    console.log(`[Warmer] Menghentikan warmer #${warmerId}`);
    const warmerState = this.activeWarmers.get(warmerId);
    if (warmerState) {
      warmerState.running = false;
      if (warmerState.timeout) {
        clearTimeout(warmerState.timeout);
        warmerState.timeout = null;
      }
      this.activeWarmers.delete(warmerId);
    }
    db.prepare('UPDATE warmer_sessions SET status = ? WHERE id = ?').run('stopped', warmerId);
  }

  deleteWarmer(warmerId) {
    console.log(`[Warmer] Memadam warmer #${warmerId}`);
    this.stopWarmer(warmerId);
    db.prepare('DELETE FROM warmer_devices WHERE warmer_id = ?').run(warmerId);
    db.prepare('DELETE FROM warmer_sessions WHERE id = ?').run(warmerId);
  }

  getSession(warmerId) {
    const session = db.prepare('SELECT * FROM warmer_sessions WHERE id = ?').get(warmerId);
    if (!session) return null;

    const devices = db.prepare('SELECT * FROM warmer_devices WHERE warmer_id = ?').all(warmerId);
    return { ...session, devices };
  }

  getSessions(userId) {
    return db.prepare('SELECT * FROM warmer_sessions WHERE user_id = ? ORDER BY id DESC').all(userId);
  }
}

module.exports = new WarmerService();
