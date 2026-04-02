'use strict';

// ── SSE Client Management ──
// Map of userId -> array of SSE response objects
const clients = new Map();

/**
 * Add an SSE client for a specific user.
 * Supports multiple connections per user (e.g., multiple browser tabs).
 * @param {number} userId
 * @param {import('express').Response} res
 */
function addClient(userId, res) {
  if (!clients.has(userId)) {
    clients.set(userId, []);
  }

  clients.get(userId).push(res);

  // Remove client on connection close
  res.on('close', () => {
    const userClients = clients.get(userId);
    if (userClients) {
      const index = userClients.indexOf(res);
      if (index !== -1) {
        userClients.splice(index, 1);
      }
      // Clean up empty arrays
      if (userClients.length === 0) {
        clients.delete(userId);
      }
    }
  });
}

/**
 * Send an SSE event to a specific user (all their connections).
 * @param {number} userId
 * @param {string} event - Event name
 * @param {*} data - Data to send (will be JSON.stringified)
 */
function emit(userId, event, data) {
  const userClients = clients.get(userId);
  if (!userClients || userClients.length === 0) return;

  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  for (const res of userClients) {
    try {
      res.write(payload);
    } catch (err) {
      console.error(`[SSE] Ralat menghantar event "${event}" kepada user ${userId}:`, err.message);
    }
  }
}

/**
 * Broadcast an SSE event to all connected users.
 * @param {string} event - Event name
 * @param {*} data - Data to send (will be JSON.stringified)
 */
function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  for (const [userId, userClients] of clients) {
    for (const res of userClients) {
      try {
        res.write(payload);
      } catch (err) {
        console.error(`[SSE] Ralat broadcast event "${event}" kepada user ${userId}:`, err.message);
      }
    }
  }
}

module.exports = { addClient, emit, broadcast };
