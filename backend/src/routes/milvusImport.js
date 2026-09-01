const express = require('express');
const db = require('../lib/db');
const { verifyToken, requireRole } = require('../lib/auth');
const { syncMilvusChamados } = require('../lib/milvusSync');
const { importMilvusPendingTicket } = require('../lib/milvusImportService');

const router = express.Router();
router.use(verifyToken);
router.use(requireRole('analista', 'gestor'));

router.get('/', async (req, res, next) => {
  try {
    const status = req.query.status || 'pendente';
    const pendentes = await db.getMilvusPendentes(status === 'todos' ? undefined : status);
    res.json(pendentes);
  } catch (err) {
    next(err);
  }
});

router.post('/sync', async (req, res, next) => {
  try {
    const result = await syncMilvusChamados();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/importar', async (req, res, next) => {
  try {
    const pendente = await db.getMilvusPendenteById(req.params.id);
    if (!pendente) {
      return res.status(404).json({ error: 'Ticket não encontrado' });
    }
    if (pendente.status !== 'pendente') {
      return res.status(409).json({ error: 'Este ticket já foi processado' });
    }

    const importingUser = await db.getUserById(req.user.sub);
    const result = await importMilvusPendingTicket({
      pendente,
      mapping: req.body,
      actorUser: importingUser,
      automatic: false
    });
    res.status(201).json({
      ...result.request,
      orcamento_id: result.budget.id,
      motivo_identificado: result.analysis.motivo_troca,
      pecas_identificadas: result.analysis.matchedParts.map((part) => part.nome),
      plano_tecnico: result.analysis.plano_tecnico
    });
  } catch (err) {
    if (err.expose) return res.status(err.statusCode || 400).json({ error: err.message });
    next(err);
  }
});

router.post('/:id/ignorar', async (req, res, next) => {
  try {
    const pendente = await db.getMilvusPendenteById(req.params.id);
    if (!pendente) {
      return res.status(404).json({ error: 'Ticket não encontrado' });
    }
    if (pendente.status !== 'pendente') {
      return res.status(409).json({ error: 'Este ticket já foi processado' });
    }
    const updated = await db.updateMilvusPendente(pendente.id, { status: 'ignorado' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
