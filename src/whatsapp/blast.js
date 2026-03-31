const { db } = require('../database');
const waManager = require('./manager');
const { triggerSync } = require('../sync');

const sleep = ms => new Promise(r => setTimeout(r, ms));

class BlastService {
  constructor() {
    this.activeJobs = new Map();
    console.log('[Blast] Servis blast dimulakan');
  }

  createJob(userId, deviceId, name, message, mediaPath, delayMin, delayMax, phones) {
    console.log(`[Blast] Mencipta kerja blast: ${name} dengan ${phones.length} penerima`);

    const result = db.prepare(`
      INSERT INTO blast_jobs (user_id, device_id, name, message, media_path, delay_min, delay_max, total, sent, failed, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 'pending')
    `).run(userId, deviceId, name, message, mediaPath || null, delayMin, delayMax);

    const blastId = result.lastInsertRowid;

    const insertRecipient = db.prepare(`
      INSERT INTO blast_recipients (blast_id, phone, status) VALUES (?, ?, 'pending')
    `);

    const insertMany = db.transaction((phoneList) => {
      for (const phone of phoneList) {
        insertRecipient.run(blastId, phone);
      }
    });

    insertMany(phones);

    db.prepare('UPDATE blast_jobs SET total = ? WHERE id = ?').run(phones.length, blastId);

    const job = db.prepare('SELECT * FROM blast_jobs WHERE id = ?').get(blastId);
    triggerSync('blast: kerja baru dicipta');
    console.log(`[Blast] Kerja blast #${blastId} berjaya dicipta`);
    return job;
  }

  async startJob(blastId) {
    const job = db.prepare('SELECT * FROM blast_jobs WHERE id = ?').get(blastId);
    if (!job) {
      throw new Error('Kerja blast tidak dijumpai');
    }

    if (job.status !== 'pending' && job.status !== 'paused') {
      throw new Error(`Tidak boleh memulakan kerja dengan status: ${job.status}`);
    }

    console.log(`[Blast] Memulakan kerja blast #${blastId}`);
    db.prepare('UPDATE blast_jobs SET status = ? WHERE id = ?').run('running', blastId);
    triggerSync('blast: mula menghantar');

    const jobState = { running: true, cancelled: false };
    this.activeJobs.set(blastId, jobState);

    const recipients = db.prepare(
      'SELECT * FROM blast_recipients WHERE blast_id = ? AND status = ?'
    ).all(blastId, 'pending');

    console.log(`[Blast] ${recipients.length} penerima belum selesai untuk blast #${blastId}`);

    for (const recipient of recipients) {
      if (jobState.cancelled) {
        console.log(`[Blast] Kerja blast #${blastId} dibatalkan`);
        break;
      }

      const jid = waManager.formatJid(recipient.phone);

      try {
        const content = { text: job.message };

        if (job.media_path) {
          content.media = job.media_path;
        }

        await waManager.sendMessage(job.device_id, jid, content);

        db.prepare('UPDATE blast_recipients SET status = ? WHERE id = ?').run('sent', recipient.id);
        db.prepare('UPDATE blast_jobs SET sent = sent + 1 WHERE id = ?').run(blastId);
        console.log(`[Blast] Mesej berjaya dihantar ke ${recipient.phone}`);
      } catch (err) {
        db.prepare('UPDATE blast_recipients SET status = ?, error = ? WHERE id = ?').run('failed', err.message, recipient.id);
        db.prepare('UPDATE blast_jobs SET failed = failed + 1 WHERE id = ?').run(blastId);
        console.log(`[Blast] Gagal menghantar ke ${recipient.phone}: ${err.message}`);
      }

      const delayMin = job.delay_min || 1;
      const delayMax = job.delay_max || 5;
      const delay = Math.floor(Math.random() * (delayMax - delayMin + 1)) + delayMin;
      console.log(`[Blast] Menunggu ${delay} saat sebelum mesej seterusnya`);
      await sleep(delay * 1000);
    }

    if (jobState.cancelled) {
      const currentJob = db.prepare('SELECT status FROM blast_jobs WHERE id = ?').get(blastId);
      if (currentJob && currentJob.status === 'running') {
        db.prepare('UPDATE blast_jobs SET status = ? WHERE id = ?').run('cancelled', blastId);
        triggerSync('blast: kerja dibatalkan');
      }
    } else {
      db.prepare('UPDATE blast_jobs SET status = ? WHERE id = ?').run('completed', blastId);
      triggerSync('blast: kerja selesai');
      console.log(`[Blast] Kerja blast #${blastId} telah selesai`);
    }

    this.activeJobs.delete(blastId);
  }

  pauseJob(blastId) {
    console.log(`[Blast] Menjeda kerja blast #${blastId}`);
    const jobState = this.activeJobs.get(blastId);
    if (jobState) {
      jobState.cancelled = true;
    }
    db.prepare('UPDATE blast_jobs SET status = ? WHERE id = ?').run('paused', blastId);
    triggerSync('blast: kerja dijeda');
  }

  cancelJob(blastId) {
    console.log(`[Blast] Membatalkan kerja blast #${blastId}`);
    const jobState = this.activeJobs.get(blastId);
    if (jobState) {
      jobState.cancelled = true;
    }
    db.prepare('UPDATE blast_jobs SET status = ? WHERE id = ?').run('cancelled', blastId);
    triggerSync('blast: kerja dibatalkan');
  }

  getJob(blastId) {
    const job = db.prepare('SELECT * FROM blast_jobs WHERE id = ?').get(blastId);
    if (!job) return null;

    const recipients = db.prepare('SELECT * FROM blast_recipients WHERE blast_id = ?').all(blastId);
    return { ...job, recipients };
  }

  getJobs(userId) {
    return db.prepare('SELECT * FROM blast_jobs WHERE user_id = ? ORDER BY id DESC').all(userId);
  }

  deleteJob(blastId) {
    console.log(`[Blast] Memadam kerja blast #${blastId}`);
    const jobState = this.activeJobs.get(blastId);
    if (jobState) {
      jobState.cancelled = true;
      this.activeJobs.delete(blastId);
    }

    db.prepare('DELETE FROM blast_recipients WHERE blast_id = ?').run(blastId);
    db.prepare('DELETE FROM blast_jobs WHERE id = ?').run(blastId);
    triggerSync('blast: kerja dipadam');
  }
}

module.exports = new BlastService();
