const express = require('express');
const db = require('../lib/db');
const { verifyToken, requireRole } = require('../lib/auth');

const router = express.Router();
router.use(verifyToken);

router.get('/', (req, res) => {
  const companies = db.getCompanies();
  if (req.user.role === 'cliente') {
    return res.json(companies.filter((c) => c.id === req.user.empresa_id));
  }
  res.json(companies);
});

router.post('/', requireRole('gestor', 'analista'), (req, res) => {
  const { razao_social, nome_fantasia, cnpj, endereco, telefone, email, responsavel, modelo_cobranca, status = 'ativo' } = req.body;
  if (!razao_social || !cnpj || !endereco) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando' });
  }
  const company = db.createCompany({ razao_social, nome_fantasia, cnpj, endereco, telefone, email, responsavel, modelo_cobranca, status });
  res.status(201).json(company);
});

router.put('/:id', requireRole('gestor', 'analista'), (req, res) => {
  const existing = db.getCompanyById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Empresa não encontrada' });
  }
  const { razao_social, nome_fantasia, cnpj, endereco, telefone, email, responsavel, modelo_cobranca, status } = req.body;
  if (!razao_social || !cnpj || !endereco) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando' });
  }
  const updated = db.updateCompany(req.params.id, { razao_social, nome_fantasia, cnpj, endereco, telefone, email, responsavel, modelo_cobranca, status });
  res.json(updated);
});

router.delete('/:id', requireRole('gestor'), (req, res) => {
  const result = db.deleteCompany(req.params.id);
  if (result.blocked) {
    return res.status(409).json({ error: 'Não é possível excluir: existem equipamentos, chamados ou regras vinculados a esta empresa' });
  }
  if (!result.deleted) {
    return res.status(404).json({ error: 'Empresa não encontrada' });
  }
  res.status(204).end();
});

module.exports = router;
