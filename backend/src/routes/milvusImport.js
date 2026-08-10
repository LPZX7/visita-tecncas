const express = require('express');
const db = require('../lib/db');
const { verifyToken, requireRole } = require('../lib/auth');
const { syncMilvusChamados } = require('../lib/milvusSync');

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

    const { empresa_id, equipamento_id, urgencia, endereco } = req.body;
    if (!empresa_id || !equipamento_id) {
      return res.status(400).json({ error: 'Selecione a empresa e o equipamento' });
    }

    const equipment = await db.getEquipmentById(equipamento_id);
    if (!equipment || equipment.empresa_id !== empresa_id) {
      return res.status(400).json({ error: 'Equipamento inválido para esta empresa' });
    }

    const descricao = [pendente.assunto, pendente.descricao].filter(Boolean).join(' — ') || `Chamado Milvus #${pendente.milvus_codigo}`;

    const request = await db.createRequest({
      empresa_id,
      equipamento_id,
      descricao,
      urgencia: urgencia || 'Normal',
      endereco: endereco || '',
      aberto_por: req.user.sub
    });

    await db.updateMilvusPendente(pendente.id, { status: 'importado', request_id: request.id });

    await db.logAudit({
      user: req.user,
      acao: 'milvus_chamado_importado',
      entidade: 'request',
      entidade_id: request.id,
      detalhes: `Importado do Milvus (ticket #${pendente.milvus_codigo}) — ${descricao}`
    });

    res.status(201).json(request);
  } catch (err) {
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
