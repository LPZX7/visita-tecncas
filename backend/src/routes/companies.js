const express = require('express');
const db = require('../lib/db');
const { verifyToken, requireRole } = require('../lib/auth');

const router = express.Router();
router.use(verifyToken);

router.get('/', async (req, res, next) => {
  try {
    const companies = await db.getCompanies();
    if (req.user.role === 'cliente') {
      return res.json(companies.filter((c) => c.id === req.user.empresa_id));
    }
    res.json(companies);
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('gestor', 'analista'), async (req, res, next) => {
  try {
    const { razao_social, nome_fantasia, cnpj, endereco, telefone, email, responsavel, modelo_cobranca, status = 'ativo' } = req.body;
    if (!razao_social || !cnpj || !endereco) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }
    const company = await db.createCompany({ razao_social, nome_fantasia, cnpj, endereco, telefone, email, responsavel, modelo_cobranca, status });
    res.status(201).json(company);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole('gestor', 'analista'), async (req, res, next) => {
  try {
    const existing = await db.getCompanyById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Empresa não encontrada' });
    }
    const { razao_social, nome_fantasia, cnpj, endereco, telefone, email, responsavel, modelo_cobranca, status } = req.body;
    if (!razao_social || !cnpj || !endereco) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }
    const updated = await db.updateCompany(req.params.id, { razao_social, nome_fantasia, cnpj, endereco, telefone, email, responsavel, modelo_cobranca, status });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('gestor'), async (req, res, next) => {
  try {
    const result = await db.deleteCompany(req.params.id);
    if (result.blocked) {
      return res.status(409).json({ error: 'Não é possível excluir: existem equipamentos, chamados ou regras vinculados a esta empresa' });
    }
    if (!result.deleted) {
      return res.status(404).json({ error: 'Empresa não encontrada' });
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
