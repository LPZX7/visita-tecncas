const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../lib/db');
const { verifyVisitApprovalToken } = require('../lib/approvalToken');

const router = express.Router();

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente novamente em alguns minutos.' }
});
router.use(publicLimiter);

// Este endpoint é só leitura (identifica o chamado a partir do link do
// email). A autorização em si exige login — ver PATCH /requests/:id/aprovacao-visita
// — para que um link vazado não permita autorizar a visita sem uma conta.
router.get('/:token', async (req, res, next) => {
  try {
    let payload;
    try {
      payload = verifyVisitApprovalToken(req.params.token);
    } catch {
      return res.status(400).json({ error: 'Link inválido ou expirado' });
    }

    const request = await db.getRequestById(payload.requestId);
    if (!request) {
      return res.status(404).json({ error: 'Chamado não encontrado' });
    }

    const company = await db.getCompanyById(request.empresa_id);
    const unit = request.unidade_id ? await db.getUnitById(request.unidade_id) : null;
    const equipment = await db.getEquipmentById(request.equipamento_id);

    res.json({
      request_id: request.id,
      numero: request.numero,
      descricao: request.descricao,
      urgencia: request.urgencia,
      endereco: request.endereco,
      agendado_para: request.agendado_para,
      empresa: company?.razao_social || null,
      unidade: unit ? `${unit.tipo} — ${unit.nome}` : null,
      equipamento: equipment ? `${equipment.modelo} — ${equipment.numero_serie}` : null,
      aprovacao_cliente: request.aprovacao_cliente || null
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
