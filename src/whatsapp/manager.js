const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { db } = require('../database');
const { emit } = require('../events');
const { syncData } = require('../sync');
const QRCode = require('qrcode');

class WAManager {
  constructor() {
    this.sessions = new Map(); // deviceId -> { socket, store, saveCreds, retryCount }
  }

  /**
   * Singleton accessor
   */
  static getInstance() {
    if (!WAManager.instance) {
      WAManager.instance = new WAManager();
    }
    return WAManager.instance;
  }

  /**
   * Connect a device via QR or pairing code
   * @param {number} deviceId
   * @param {number} userId
   * @param {'qr'|'pairing'} method
   */
  async connect(deviceId, userId, method = 'qr') {
    // Disconnect existing session if any
    if (this.sessions.has(deviceId)) {
      await this.disconnect(deviceId);
    }

    const sessionDir = path.join(config.DATA_DIR, 'sessions', String(deviceId));
    fs.mkdirSync(sessionDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const logger = pino({ level: 'silent' });

    const socket = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger)
      },
      printQRInTerminal: false,
      logger,
      generateHighQualityLinkPreview: false,
      defaultQueryTimeoutMs: undefined
    });

    const session = {
      socket,
      saveCreds,
      retryCount: 0
    };

    this.sessions.set(deviceId, session);

    // Request pairing code if method is 'pairing'
    if (method === 'pairing') {
      // Wait a bit for the socket to be ready then request pairing code
      setTimeout(async () => {
        try {
          const code = await socket.requestPairingCode(String(deviceId));
          emit(userId, 'pairing-code', { deviceId, code });
        } catch (err) {
          console.error(`[WAManager] Pairing code request failed for device ${deviceId}:`, err.message);
        }
      }, 3000);
    }

    // Handle connection updates
    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // Emit QR code for QR method
      if (qr && method === 'qr') {
        try {
          const dataUrl = await QRCode.toDataURL(qr);
          emit(userId, 'qr-code', { deviceId, qr: dataUrl });
        } catch (err) {
          console.error(`[WAManager] QR generation failed for device ${deviceId}:`, err.message);
        }
      }

      if (connection === 'open') {
        session.retryCount = 0;

        // Extract phone number from socket user id (format: phone:instance@s.whatsapp.net)
        let phone = null;
        if (socket.user && socket.user.id) {
          phone = socket.user.id.split(':')[0].split('@')[0];
        }

        // Update DB
        db.prepare(
          'UPDATE devices SET status = ?, phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).run('connected', phone, deviceId);

        emit(userId, 'device-status', { deviceId, status: 'connected', phone });
        console.log(`[WAManager] Device ${deviceId} connected (phone: ${phone})`);

        syncData();
      }

      if (connection === 'close') {
        const boom = lastDisconnect?.error;
        let code = 500;
        if (boom) {
          try {
            code = new Boom(boom).output.statusCode;
          } catch (e) {
            code = (boom && boom.output && boom.output.statusCode) ? boom.output.statusCode : 500;
          }
        }

        console.log(`[WAManager] Device ${deviceId} disconnected (code: ${code})`);

        if (code === DisconnectReason.loggedOut || code === 401) {
          // Session invalidated — clean up
          const sessionDir = path.join(config.DATA_DIR, 'sessions', String(deviceId));
          try {
            fs.rmSync(sessionDir, { recursive: true, force: true });
          } catch (err) {
            console.error(`[WAManager] Failed to remove session for device ${deviceId}:`, err.message);
          }

          db.prepare(
            'UPDATE devices SET status = ?, phone = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
          ).run('disconnected', deviceId);

          this.sessions.delete(deviceId);
          emit(userId, 'device-status', { deviceId, status: 'disconnected', phone: null });
          syncData();
        } else {
          // Retry with exponential backoff (max 3 retries)
          this.sessions.delete(deviceId);

          if (session.retryCount < 3) {
            const delay = Math.pow(2, session.retryCount + 1) * 1000; // 2s, 4s, 8s
            session.retryCount++;
            console.log(`[WAManager] Retrying device ${deviceId} in ${delay}ms (attempt ${session.retryCount}/3)`);

            setTimeout(() => {
              this.connect(deviceId, userId, method).catch((err) => {
                console.error(`[WAManager] Retry failed for device ${deviceId}:`, err.message);
              });
            }, delay);
          } else {
            db.prepare(
              'UPDATE devices SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
            ).run('disconnected', deviceId);

            emit(userId, 'device-status', { deviceId, status: 'disconnected', phone: null });
            console.error(`[WAManager] Device ${deviceId} max retries reached, giving up`);
            syncData();
          }
        }
      }
    });

    // Handle credential updates
    socket.ev.on('creds.update', saveCreds);

    // Handle incoming messages
    socket.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
      if (type !== 'notify') return;

      for (const msg of msgs) {
        try {
          const remoteJid = msg.key.remoteJid;
          if (!remoteJid || remoteJid === 'status@broadcast') continue;

          const fromMe = msg.key.fromMe ? 1 : 0;
          const text = msg.message?.conversation
            || msg.message?.extendedTextMessage?.text
            || msg.message?.imageMessage?.caption
            || msg.message?.videoMessage?.caption
            || '';

          const timestamp = msg.messageTimestamp
            ? (typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : Number(msg.messageTimestamp))
            : Math.floor(Date.now() / 1000);

          // Save to DB
          db.prepare(
            'INSERT INTO messages (device_id, remote_jid, from_me, message, timestamp, status) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(deviceId, remoteJid, fromMe, text, timestamp, 'received');

          emit(userId, 'new-message', {
            deviceId,
            message: {
              remoteJid,
              fromMe,
              text,
              timestamp
            }
          });

          // Check auto-reply for incoming messages only
          if (!fromMe && text) {
            const { processAutoReply } = require('./autoReply');
            await processAutoReply(deviceId, msg, remoteJid);
          }

          syncData();
        } catch (err) {
          console.error(`[WAManager] Error processing message for device ${deviceId}:`, err.message);
        }
      }
    });

    return session;
  }

  /**
   * Disconnect a device
   * @param {number} deviceId
   */
  async disconnect(deviceId) {
    const session = this.sessions.get(deviceId);
    if (session) {
      try {
        session.socket.end();
      } catch (err) {
        console.error(`[WAManager] Error closing socket for device ${deviceId}:`, err.message);
      }
      this.sessions.delete(deviceId);
    }

    db.prepare(
      'UPDATE devices SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run('disconnected', deviceId);
  }

  /**
   * Disconnect all active sessions
   */
  async disconnectAll() {
    const deviceIds = Array.from(this.sessions.keys());
    for (const deviceId of deviceIds) {
      await this.disconnect(deviceId);
    }
    console.log(`[WAManager] All sessions disconnected (${deviceIds.length} total)`);
  }

  /**
   * Get a session by device ID
   * @param {number} deviceId
   * @returns {object|null}
   */
  getSession(deviceId) {
    return this.sessions.get(deviceId) || null;
  }

  /**
   * Check if a device is connected
   * @param {number} deviceId
   * @returns {boolean}
   */
  isConnected(deviceId) {
    const session = this.sessions.get(deviceId);
    if (!session || !session.socket) return false;
    return session.socket.user ? true : false;
  }

  /**
   * Reconnect all devices that were marked as connected in DB
   * Called on server startup
   */
  async reconnectAll() {
    try {
      const devices = db.prepare(
        "SELECT d.id, d.user_id FROM devices d WHERE d.status = 'connected'"
      ).all();

      if (devices.length === 0) {
        console.log('[WAManager] No devices to reconnect');
        return;
      }

      console.log(`[WAManager] Reconnecting ${devices.length} device(s)...`);

      for (const device of devices) {
        try {
          await this.connect(device.id, device.user_id, 'qr');
          console.log(`[WAManager] Reconnected device ${device.id}`);
        } catch (err) {
          console.error(`[WAManager] Failed to reconnect device ${device.id}:`, err.message);
          db.prepare(
            'UPDATE devices SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
          ).run('disconnected', device.id);
        }
      }
    } catch (err) {
      console.error('[WAManager] Error during reconnectAll:', err.message);
    }
  }
}

// Initialize singleton static field
WAManager.instance = null;

module.exports = WAManager;
