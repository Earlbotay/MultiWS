const express = require('express');
const router = express.Router();
const db = require('../database');
const WAManager = require('../whatsapp/manager');

// GET / — Status of all user's devices
router.get('/', (req, res) => {
  try {
    const devices = db.prepare('SELECT * FROM devices WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    const manager = WAManager.getInstance();

    let connected = 0;
    let disconnected = 0;

    const deviceStatuses = devices.map((device) => {
      const isConnected = manager.isConnected(device.id);
      if (isConnected) {
        connected++;
      } else {
        disconnected++;
      }

      return {
        id: device.id,
        name: device.name,
        phone: device.phone,
        status: isConnected ? 'connected' : 'disconnected',
        created_at: device.created_at,
        updated_at: device.updated_at
      };
    });

    res.json({
      success: true,
      data: {
        devices: deviceStatuses,
        summary: {
          total: devices.length,
          connected,
          disconnected
        }
      }
    });
  } catch (err) {
    console.error('Get status error:', err);
    res.status(500).json({ success: false, error: 'Ralat server' });
  }
});

module.exports = router;
