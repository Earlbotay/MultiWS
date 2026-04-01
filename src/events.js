/**
 * Sistem SSE (Server-Sent Events) untuk kemas kini masa nyata
 */
const clients = new Map(); // userId -> Set of response objects

function addClient(userId, res) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);
  res.on('close', () => {
    const userClients = clients.get(userId);
    if (userClients) {
      userClients.delete(res);
      if (userClients.size === 0) clients.delete(userId);
    }
  });
}

function emit(userId, event, data) {
  const userClients = clients.get(userId);
  if (userClients) {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of userClients) {
      try { res.write(msg); } catch (e) {}
    }
  }
}

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [, userClients] of clients) {
    for (const res of userClients) {
      try { res.write(msg); } catch (e) {}
    }
  }
}

module.exports = { addClient, emit, broadcast };
