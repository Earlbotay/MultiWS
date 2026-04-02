const { db } = require('../database');
const { emit } = require('../events');
const { syncData } = require('../sync');
const WAManager = require('./manager');

/**
 * Start a blast job — sends messages to all pending recipients with random delays
 * @param {number} blastId
 */
async function startBlast(blastId) {
  const blast = db.prepare(
    'SELECT * FROM blast_jobs WHERE id = ?'
  ).get(blastId);

  if (!blast) {
    throw new Error(`Blast job ${blastId} not found`);
  }

  const manager = WAManager.getInstance();
  const session = manager.getSession(blast.device_id);

  if (!session || !session.socket) {
    db.prepare('UPDATE blast_jobs SET status = ? WHERE id = ?').run('failed', blastId);
    throw new Error(`Device ${blast.device_id} is not connected`);
  }

  // Update blast status to running
  db.prepare('UPDATE blast_jobs SET status = ? WHERE id = ?').run('running', blastId);

  emit(blast.user_id, 'blast-progress', {
    blastId,
    sent: blast.sent,
    failed: blast.failed,
    total: blast.total,
    status: 'running'
  });

  // Get pending recipients
  const recipients = db.prepare(
    "SELECT * FROM blast_recipients WHERE blast_id = ? AND status = 'pending'"
  ).all(blastId);

  let sentCount = blast.sent || 0;
  let failedCount = blast.failed || 0;

  for (const recipient of recipients) {
    // Check if blast was stopped mid-execution
    const currentBlast = db.prepare('SELECT status FROM blast_jobs WHERE id = ?').get(blastId);
    if (currentBlast && currentBlast.status === 'stopped') {
      console.log(`[Blast] Blast ${blastId} was stopped by user`);
      emit(blast.user_id, 'blast-progress', {
        blastId,
        sent: sentCount,
        failed: failedCount,
        total: blast.total,
        status: 'stopped'
      });
      syncData();
      return;
    }

    // Format phone to WhatsApp JID
    const phone = recipient.phone.replace(/[^0-9]/g, '');
    const jid = `${phone}@s.whatsapp.net`;

    try {
      await session.socket.sendMessage(jid, { text: blast.message });

      // Update recipient status to sent
      db.prepare(
        'UPDATE blast_recipients SET status = ?, sent_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run('sent', recipient.id);

      sentCount++;

      // Save sent message to messages table
      db.prepare(
        'INSERT INTO messages (device_id, remote_jid, from_me, message, timestamp, status) VALUES (?, ?, 1, ?, ?, ?)'
      ).run(blast.device_id, jid, blast.message, Math.floor(Date.now() / 1000), 'sent');

    } catch (err) {
      console.error(`[Blast] Failed to send to ${phone}:`, err.message);

      // Update recipient status to failed
      db.prepare(
        'UPDATE blast_recipients SET status = ?, error = ? WHERE id = ?'
      ).run('failed', err.message, recipient.id);

      failedCount++;
    }

    // Update blast job counts
    db.prepare(
      'UPDATE blast_jobs SET sent = ?, failed = ? WHERE id = ?'
    ).run(sentCount, failedCount, blastId);

    // Emit progress update
    emit(blast.user_id, 'blast-progress', {
      blastId,
      sent: sentCount,
      failed: failedCount,
      total: blast.total,
      status: 'running'
    });

    // Random delay between delayMin and delayMax (in seconds, converted to ms)
    const delayMin = (blast.delay_min || 1) * 1000;
    const delayMax = (blast.delay_max || 5) * 1000;
    const delay = Math.floor(Math.random() * (delayMax - delayMin + 1)) + delayMin;

    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  // Determine final status
  const finalStatus = failedCount === blast.total ? 'failed' : 'completed';

  db.prepare(
    'UPDATE blast_jobs SET status = ?, sent = ?, failed = ? WHERE id = ?'
  ).run(finalStatus, sentCount, failedCount, blastId);

  emit(blast.user_id, 'blast-progress', {
    blastId,
    sent: sentCount,
    failed: failedCount,
    total: blast.total,
    status: finalStatus
  });

  console.log(`[Blast] Blast ${blastId} ${finalStatus} — sent: ${sentCount}, failed: ${failedCount}`);
  syncData();
}

/**
 * Stop a running blast job
 * @param {number} blastId
 */
function stopBlast(blastId) {
  db.prepare(
    "UPDATE blast_jobs SET status = 'stopped' WHERE id = ? AND status = 'running'"
  ).run(blastId);
}

module.exports = { startBlast, stopBlast };
