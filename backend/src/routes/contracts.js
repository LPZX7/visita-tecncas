const express = require('express');
const db = require('../lib/db');
const { verifyToken } = require('../lib/auth');
const { generateContractPdf } = require('../lib/contractPdf');

const router = express.Router();
router.use(verifyToken);

router.get('/', (req, res) => {
  const contracts = db.getContracts();
  if (req.user.role === 'cliente') {
    return res.json(contracts.filter((c) => c.empresa_id === req.user.empresa_id));
  }
  res.json(contracts);
});

function loadContractBundle(id) {
  const contract = db.getContractById(id);
  if (!contract) return null;
  const budget = db.getBudgetById(contract.orcamento_id);
  const request = db.getRequestById(contract.request_id);
  const company = db.getCompanyById(contract.empresa_id);
  return { contract, budget, request, company };
}

router.get('/:id', (req, res) => {
  const bundle = loadContractBundle(req.params.id);
  if (!bundle) {
    return res.status(404).json({ error: 'Contrato não encontrado' });
  }
  if (req.user.role === 'cliente' && bundle.contract.empresa_id !== req.user.empresa_id) {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  res.json(bundle.contract);
});

router.get('/:id/pdf', (req, res) => {
  const bundle = loadContractBundle(req.params.id);
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
});

module.exports = router;
