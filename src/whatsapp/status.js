const fs = require('fs');
const waManager = require('./manager');
const { triggerSync } = require('../sync');

class StatusService {
  constructor() {
    console.log('[Status] Servis status WhatsApp dimulakan');
  }

  async postTextStatus(deviceId, text, backgroundColor, font) {
    console.log(`[Status] Menghantar status teks untuk peranti ${deviceId}`);

    const socket = waManager.getSocket(deviceId);
    if (!socket) {
      throw new Error('Peranti tidak disambungkan');
    }

    let content;

    if (backgroundColor || font) {
      // Guna format extendedTextMessage untuk sokongan warna latar dan fon
      content = {
        extendedTextMessage: {
          text: text,
          backgroundArgb: backgroundColor
            ? parseInt('FF' + backgroundColor.replace('#', ''), 16)
            : 0xFF128C7E, // Warna hijau WhatsApp lalai
          font: font !== undefined ? parseInt(font) : 0,
          inviteLinkGroupTypeV2: 0,
          previewType: 0
        }
      };
    } else {
      content = { text };
    }

    const result = await socket.sendMessage('status@broadcast', content);
    triggerSync('status: status teks dihantar');
    console.log(`[Status] Status teks berjaya dihantar untuk peranti ${deviceId}`);
    return result;
  }

  async postImageStatus(deviceId, imagePath, caption) {
    console.log(`[Status] Menghantar status gambar untuk peranti ${deviceId}`);

    const socket = waManager.getSocket(deviceId);
    if (!socket) {
      throw new Error('Peranti tidak disambungkan');
    }

    if (!fs.existsSync(imagePath)) {
      throw new Error('Fail gambar tidak dijumpai');
    }

    const buffer = fs.readFileSync(imagePath);

    const content = {
      image: buffer,
    };

    if (caption) {
      content.caption = caption;
    }

    const result = await socket.sendMessage('status@broadcast', content);
    triggerSync('status: status gambar dihantar');
    console.log(`[Status] Status gambar berjaya dihantar untuk peranti ${deviceId}`);
    return result;
  }

  async postVideoStatus(deviceId, videoPath, caption) {
    console.log(`[Status] Menghantar status video untuk peranti ${deviceId}`);

    const socket = waManager.getSocket(deviceId);
    if (!socket) {
      throw new Error('Peranti tidak disambungkan');
    }

    if (!fs.existsSync(videoPath)) {
      throw new Error('Fail video tidak dijumpai');
    }

    const buffer = fs.readFileSync(videoPath);

    const content = {
      video: buffer,
    };

    if (caption) {
      content.caption = caption;
    }

    const result = await socket.sendMessage('status@broadcast', content);
    triggerSync('status: status video dihantar');
    console.log(`[Status] Status video berjaya dihantar untuk peranti ${deviceId}`);
    return result;
  }
}

module.exports = new StatusService();
