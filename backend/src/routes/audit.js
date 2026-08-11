const express = require('express');
const db = require('../lib/db');
const { verifyToken, requireRole } = require('../lib/auth');

const router = express.Router();
router.use(verifyToken);

router.get('/', requireRole('analista', 'gestor'), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));
    const result = await db.getAuditLog({ page, pageSize });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.delete('/', requireRole('gestor'), async (req, res, next) => {
  try {
    await db.clearAuditLog();
    await db.logAudit({
      user: req.user,
      acao: 'auditoria_limpa',
      entidade: 'audit_log',
      detalhes: 'Log de auditoria limpo por completo'
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
