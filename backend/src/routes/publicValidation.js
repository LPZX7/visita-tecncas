const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../lib/db');

const router = express.Router();

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente novamente em alguns minutos.' }
});
router.use(publicLimiter);

router.get('/:codigo', async (req, res, next) => {
  try {
    const aceite = await db.getVisitaAceiteByCodigo(req.params.codigo);
    if (!aceite) {
      return res.status(404).json({ error: 'Documento não encontrado' });
    }
    const request = await db.getRequestById(aceite.request_id);
    const contract = aceite.contrato_id ? await db.getContractById(aceite.contrato_id) : null;

    res.json({
      valido: true,
      visita_numero: request?.numero || null,
      contrato_numero: contract?.numero || null,
      data_aceite: aceite.criado_em,
      nome_aceitante: aceite.nome_aceitante,
      codigo_validacao: aceite.codigo_validacao,
      versao_termo: aceite.versao_termo,
      hash_documento: aceite.hash_documento
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
