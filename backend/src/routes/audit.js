const express = require('express');
const db = require('../lib/db');
const { verifyToken, requireRole } = require('../lib/auth');

const router = express.Router();
router.use(verifyToken);

router.get('/', requireRole('gestor'), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));
    const result = await db.getAuditLog({ page, pageSize });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
