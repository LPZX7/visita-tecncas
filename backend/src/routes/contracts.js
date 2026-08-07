const express = require('express');
const db = require('../lib/db');
const { verifyToken } = require('../lib/auth');
const { generateContractPdf } = require('../lib/contractPdf');

const router = express.Router();
router.use(verifyToken);

router.get('/', async (req, res, next) => {
  try {
    const contracts = await db.getContracts();
    if (req.user.role === 'cliente') {
      return res.json(contracts.filter((c) => c.empresa_id === req.user.empresa_id));
    }
    res.json(contracts);
  } catch (err) {
    next(err);
  }
});

async function loadContractBundle(id) {
  const contract = await db.getContractById(id);
  if (!contract) return null;
  const budget = await db.getBudgetById(contract.orcamento_id);
  const request = await db.getRequestById(contract.request_id);
  const company = await db.getCompanyById(contract.empresa_id);
  const unit = budget?.unidade_id ? await db.getUnitById(budget.unidade_id) : null;
  return { contract, budget, request, company, unit };
}

router.get('/:id', async (req, res, next) => {
  try {
    const bundle = await loadContractBundle(req.params.id);
    if (!bundle) {
      return res.status(404).json({ error: 'Contrato não encontrado' });
    }
    if (req.user.role === 'cliente' && bundle.contract.empresa_id !== req.user.empresa_id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    res.json(bundle.contract);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/pdf', async (req, res, next) => {
  try {
    const bundle = await loadContractBundle(req.params.id);
    if (!bundle) {
      return res.status(404).json({ error: 'Contrato não encontrado' });
    }
    if (req.user.role === 'cliente' && bundle.contract.empresa_id !== req.user.empresa_id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${bundle.contract.numero}.pdf"`);

    const doc = generateContractPdf(bundle);
    doc.pipe(res);
    doc.end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
