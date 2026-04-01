const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { db } = require('../database');
const { triggerSync } = require('../sync');
const events = require('../events');

class WAManager {
  constructor() {
    this.sessions = new Map();
    this.messageHandlers = [];
    this.logger = pino({ level: 'silent' });
    console.log('[WAManager] Pengurus sesi WhatsApp dimulakan');
  }

  /**
   * Mulakan sesi WhatsApp untuk peranti tertentu
   * @param {number} deviceId
   * @param {string} method - 'qr' atau 'pairing'
   * @param {string} phoneNumber - nombor telefon untuk pairing code
   */
  async startSession(deviceId, method = 'qr', phoneNumber = null) {
    try {
      const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(deviceId);
      if (!device) {
        throw new Error('Peranti tidak dijumpai dalam pangkalan data');
      }

      // Hentikan sesi sedia ada jika wujud
      if (this.sessions.has(deviceId)) {
        try {
          const existing = this.sessions.get(deviceId);
          existing.socket.end(new Error('Memulakan semula sesi'));
        } catch (e) {}
        this.sessions.delete(deviceId);
      }

      const authDir = path.join(config.SESSIONS_DIR, `device_${deviceId}`);
      if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true });
      }

      const { state, saveCreds } = await useMultiFileAuthState(authDir);
      const { version } = await fetchLatestBaileysVersion();

      console.log(`[WAManager] Memulakan sesi untuk peranti #${deviceId} (kaedah: ${method}) dengan versi Baileys ${version.join('.')}`);

      const socket = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, this.logger)
        },
        printQRInTerminal: false,
        browser: ['Windows', 'Edge', '110.0.0'],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        qrTimeout: 40000,
        keepAliveIntervalMs: 25000,
        logger: this.logger,
        version
      });

      this.sessions.set(deviceId, {
        socket,
        saveCreds,
        qr: null,
        pairingCode: null,
        status: 'connecting',
        method,
        retryCount: 0
      });

      // Pengendali kemas kini sambungan
      socket.ev.on('connection.update', async (update) => {
        const session = this.sessions.get(deviceId);
        if (!session) return;

        const { connection, lastDisconnect, qr } = update;

        if (qr && method === 'qr') {
          console.log(`[WAManager] Kod QR diterima untuk peranti #${deviceId}`);
          session.qr = qr;
          session.status = 'waiting_qr';
        }

        // Minta pairing code bila dapat QR pertama (untuk kaedah pairing)
        if (qr && method === 'pairing' && !session.pairingCode && phoneNumber) {
          try {
            let cleaned = phoneNumber.replace(/[\s\-\+\(\)]/g, '');
            console.log(`[WAManager] Meminta pairing code untuk ${cleaned}...`);
            const code = await socket.requestPairingCode(cleaned);
            session.pairingCode = code;
            session.status = 'waiting_pairing';
            console.log(`[WAManager] Pairing code untuk peranti #${deviceId}: ${code}`);
          } catch (err) {
            console.error(`[WAManager] Gagal mendapatkan pairing code: ${err.message}`);
            session.status = 'error';
            session.error = 'Gagal mendapatkan pairing code. Pastikan nombor telefon betul.';
          }
        }

        if (connection === 'open') {
          console.log(`[WAManager] Peranti #${deviceId} berjaya disambung`);
          session.status = 'connected';
          session.qr = null;
          session.pairingCode = null;
          session.retryCount = 0;

          // Dapatkan nombor telefon dari socket.user.id
          let phone = null;
          if (socket.user && socket.user.id) {
            phone = socket.user.id.split('@')[0].split(':')[0];
          }

          db.prepare('UPDATE devices SET status = ?, phone = ?, updated_at = datetime(\'now\') WHERE id = ?')
            .run('connected', phone, deviceId);
          triggerSync('peranti: berjaya disambung');

          // Emit SSE event
          try {
            const deviceInfo = db.prepare('SELECT user_id FROM devices WHERE id = ?').get(deviceId);
            if (deviceInfo) events.emit(deviceInfo.user_id, 'device-status', { deviceId, status: 'connected', phone });
          } catch (e) {}
        }

        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          console.log(`[WAManager] Sambungan peranti #${deviceId} ditutup. Kod status: ${statusCode}`);

          if (statusCode === DisconnectReason.loggedOut) {
            console.log(`[WAManager] Peranti #${deviceId} telah log keluar. Memadam sesi...`);
            const sessionAuthDir = path.join(config.SESSIONS_DIR, `device_${deviceId}`);
            if (fs.existsSync(sessionAuthDir)) {
              fs.rmSync(sessionAuthDir, { recursive: true, force: true });
            }
            db.prepare('UPDATE devices SET status = ?, updated_at = datetime(\'now\') WHERE id = ?')
              .run('disconnected', deviceId);
            triggerSync('peranti: log keluar');
            session.status = 'disconnected';
            session.qr = null;
            session.pairingCode = null;
            this.sessions.delete(deviceId);
          } else if (shouldReconnect && session.retryCount < 3) {
            const nextRetry = session.retryCount + 1;
            session.status = 'reconnecting';
            console.log(`[WAManager] Cuba semula sambungan peranti #${deviceId} (percubaan ${nextRetry}/3)...`);
            setTimeout(async () => {
              try {
                await this.startSession(deviceId, method, phoneNumber);
                // Kemaskini retryCount pada session yang baru dicipta
                const newSession = this.sessions.get(deviceId);
                if (newSession) {
                  newSession.retryCount = nextRetry;
                }
              } catch (err) {
                console.error(`[WAManager] Gagal menyambung semula peranti #${deviceId}: ${err.message}`);
                db.prepare('UPDATE devices SET status = ?, updated_at = datetime(\'now\') WHERE id = ?')
                  .run('disconnected', deviceId);
                this.sessions.delete(deviceId);
              }
            }, 3000 * nextRetry);
          } else {
            console.log(`[WAManager] Peranti #${deviceId} gagal disambung semula selepas ${session.retryCount} percubaan`);
            db.prepare('UPDATE devices SET status = ?, updated_at = datetime(\'now\') WHERE id = ?')
              .run('disconnected', deviceId);
            triggerSync('peranti: gagal sambung semula');
            session.status = 'disconnected';
            this.sessions.delete(deviceId);
          }
        }
      });

      // Pengendali kemas kini kelayakan
      socket.ev.on('creds.update', saveCreds);

      // Pengendali mesej masuk
      socket.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
        const session = this.sessions.get(deviceId);
        if (!session) return;

        for (const msg of msgs) {
          try {
            if (msg.key.fromMe && msg.key.remoteJid !== 'status@broadcast') {
              continue;
            }

            const messageContent = msg.message;
            if (!messageContent) continue;

            let text = null;
            if (messageContent.conversation) {
              text = messageContent.conversation;
            } else if (messageContent.extendedTextMessage?.text) {
              text = messageContent.extendedTextMessage.text;
            } else if (messageContent.imageMessage?.caption) {
              text = messageContent.imageMessage.caption;
            } else if (messageContent.videoMessage?.caption) {
              text = messageContent.videoMessage.caption;
            } else if (messageContent.documentMessage?.caption) {
              text = messageContent.documentMessage.caption;
            } else if (messageContent.buttonsResponseMessage?.selectedDisplayText) {
              text = messageContent.buttonsResponseMessage.selectedDisplayText;
            } else if (messageContent.listResponseMessage?.title) {
              text = messageContent.listResponseMessage.title;
            } else if (messageContent.templateButtonReplyMessage?.selectedDisplayText) {
              text = messageContent.templateButtonReplyMessage.selectedDisplayText;
            }

            if (!text) continue;

            const sender = msg.key.participant || msg.key.remoteJid;
            const timestamp = msg.messageTimestamp
              ? (typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : msg.messageTimestamp.low || 0)
              : Math.floor(Date.now() / 1000);

            db.prepare(
              `INSERT INTO messages (device_id, remote_jid, sender, message, is_outgoing, timestamp, created_at)
               VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
            ).run(
              deviceId,
              msg.key.remoteJid,
              sender,
              text,
              msg.key.fromMe ? 1 : 0,
              timestamp
            );

            triggerSync('chat: mesej masuk');
            console.log(`[WAManager] Mesej baru diterima untuk peranti #${deviceId} dari ${sender}`);

            for (const handler of this.messageHandlers) {
              try {
                await handler(deviceId, msg, socket);
              } catch (handlerErr) {
                console.error(`[WAManager] Ralat dalam pengendali mesej: ${handlerErr.message}`);
              }
            }
          } catch (msgErr) {
            console.error(`[WAManager] Ralat memproses mesej: ${msgErr.message}`);
          }
        }
      });

      return { success: true };
    } catch (err) {
      console.error(`[WAManager] Ralat memulakan sesi peranti #${deviceId}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Hentikan sesi WhatsApp untuk peranti tertentu
   */
  async stopSession(deviceId) {
    try {
      const session = this.sessions.get(deviceId);
      if (session) {
        console.log(`[WAManager] Menghentikan sesi peranti #${deviceId}...`);
        session.socket.end(new Error('Sesi dihentikan oleh pengguna'));
        this.sessions.delete(deviceId);
      }

      db.prepare('UPDATE devices SET status = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run('disconnected', deviceId);

      triggerSync('peranti: sesi dihentikan');
      console.log(`[WAManager] Sesi peranti #${deviceId} telah dihentikan`);
    } catch (err) {
      console.error(`[WAManager] Ralat menghentikan sesi peranti #${deviceId}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Padam sesi dan semua data berkaitan peranti
   */
  async deleteSession(deviceId) {
    try {
      console.log(`[WAManager] Memadam sesi dan data peranti #${deviceId}...`);

      await this.stopSession(deviceId);

      const authDir = path.join(config.SESSIONS_DIR, `device_${deviceId}`);
      if (fs.existsSync(authDir)) {
        fs.rmSync(authDir, { recursive: true, force: true });
        console.log(`[WAManager] Direktori sesi peranti #${deviceId} telah dipadam`);
      }

      db.prepare('DELETE FROM messages WHERE device_id = ?').run(deviceId);
      db.prepare('DELETE FROM devices WHERE id = ?').run(deviceId);

      triggerSync('peranti: padam sesi dan data');
      console.log(`[WAManager] Peranti #${deviceId} dan semua data berkaitan telah dipadam`);
    } catch (err) {
      console.error(`[WAManager] Ralat memadam peranti #${deviceId}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Dapatkan kod QR untuk peranti tertentu
   */
  getQR(deviceId) {
    const session = this.sessions.get(deviceId);
    return session ? session.qr : null;
  }

  /**
   * Dapatkan pairing code untuk peranti tertentu
   */
  getPairingCode(deviceId) {
    const session = this.sessions.get(deviceId);
    return session ? session.pairingCode : null;
  }

  /**
   * Dapatkan status semasa peranti
   */
  getStatus(deviceId) {
    const session = this.sessions.get(deviceId);
    return session ? session.status : 'disconnected';
  }

  /**
   * Dapatkan maklumat ralat
   */
  getError(deviceId) {
    const session = this.sessions.get(deviceId);
    return session ? session.error : null;
  }

  /**
   * Dapatkan objek soket untuk peranti tertentu
   */
  getSocket(deviceId) {
    const session = this.sessions.get(deviceId);
    return session ? session.socket : null;
  }

  /**
   * Hantar mesej melalui peranti tertentu
   */
  async sendMessage(deviceId, jid, content, options = {}) {
    const session = this.sessions.get(deviceId);
    if (!session || session.status !== 'connected') {
      throw new Error('Peranti tidak disambung. Sila pastikan peranti dalam keadaan aktif.');
    }

    try {
      console.log(`[WAManager] Menghantar mesej dari peranti #${deviceId} ke ${jid}`);
      const result = await session.socket.sendMessage(jid, content, options);

      const text = content.text || content.caption || '[media]';
      db.prepare(
        `INSERT INTO messages (device_id, remote_jid, sender, message, is_outgoing, timestamp, created_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
      ).run(
        deviceId,
        jid,
        'me',
        text,
        1,
        Math.floor(Date.now() / 1000)
      );

      triggerSync('chat: mesej dihantar');
      console.log(`[WAManager] Mesej berjaya dihantar dari peranti #${deviceId} ke ${jid}`);
      return result;
    } catch (err) {
      console.error(`[WAManager] Ralat menghantar mesej dari peranti #${deviceId}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Daftar pengendali mesej baharu
   */
  registerMessageHandler(handler) {
    if (typeof handler === 'function') {
      this.messageHandlers.push(handler);
      console.log(`[WAManager] Pengendali mesej baru didaftarkan. Jumlah: ${this.messageHandlers.length}`);
    }
  }

  /**
   * Format nombor telefon ke JID WhatsApp
   */
  formatJid(phone) {
    let cleaned = phone.replace(/[\s\-\+\(\)]/g, '');
    if (!cleaned.endsWith('@s.whatsapp.net')) {
      cleaned = cleaned + '@s.whatsapp.net';
    }
    return cleaned;
  }

  /**
   * Ekstrak nombor telefon dari JID
   */
  extractNumber(jid) {
    if (!jid) return null;
    return jid.split('@')[0].split(':')[0];
  }
}

// Eksport sebagai singleton
module.exports = new WAManager();
