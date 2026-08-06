const express = require('express');
const db = require('../lib/db');
const { verifyToken } = require('../lib/auth');

const router = express.Router();
router.use(verifyToken);

router.get('/', async (req, res, next) => {
  try {
    if (!req.user.empresa_id) {
      return res.json([]);
    }
    res.json(await db.getNotifications(req.user.empresa_id));
  } catch (err) {
    next(err);
  }
});

router.patch('/read-all', async (req, res, next) => {
  try {
    if (req.user.empresa_id) {
      await db.markNotificationsRead(req.user.empresa_id);
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
