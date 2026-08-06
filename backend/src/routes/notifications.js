const express = require('express');
const db = require('../lib/db');
const { verifyToken } = require('../lib/auth');

const router = express.Router();
router.use(verifyToken);

router.get('/', (req, res) => {
  if (!req.user.empresa_id) {
    return res.json([]);
  }
  res.json(db.getNotifications(req.user.empresa_id));
});

router.patch('/read-all', (req, res) => {
  if (req.user.empresa_id) {
    db.markNotificationsRead(req.user.empresa_id);
  }
  res.json({ ok: true });
});

module.exports = router;
