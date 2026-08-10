const express = require('express');
const db = require('../lib/db');
const { verifyToken, requireRole } = require('../lib/auth');
const { calculateValorDeslocamento } = require('../lib/deslocamento');

const router = express.Router();
router.use(verifyToken);

router.get('/', async (req, res, next) => {
  try {
    const empresaId = req.user.role === 'cliente' ? req.user.empresa_id : req.query.empresa_id;
    res.json(await db.getUnits(empresaId || undefined));
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('gestor', 'analista'), async (req, res, next) => {
  try {
    const { empresa_id, nome, tipo, codigo, cnpj, cep, endereco, numero, complemento, bairro, cidade, estado, telefone, email, responsavel, status } = req.body;
    if (!empresa_id) {
      return res.status(400).json({ error: 'Selecione uma empresa' });
    }
    if (!nome) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }
    if (!['Sede', 'Filial'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo inválido' });
    }
    if (!(await db.getCompanyById(empresa_id))) {
      return res.status(400).json({ error: 'Empresa inválida' });
    }
    const valor_deslocamento_padrao = await calculateValorDeslocamento({ endereco, numero, bairro, cidade, estado });
    const unit = await db.createUnit({
      empresa_id, nome, tipo, codigo, cnpj, cep, endereco, numero, complemento, bairro, cidade, estado, telefone, email, responsavel, status,
      valor_deslocamento_padrao
    });
    res.status(201).json(unit);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Esta empresa já possui uma sede cadastrada.' });
    }
    next(err);
  }
});

router.put('/:id', requireRole('gestor', 'analista'), async (req, res, next) => {
  try {
    const existing = await db.getUnitById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Unidade não encontrada' });
    }
    const { nome, tipo, codigo, cnpj, cep, endereco, numero, complemento, bairro, cidade, estado, telefone, email, responsavel, status } = req.body;
    if (!nome) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }
    const patch = { nome, codigo, cnpj, cep, endereco, numero, complemento, bairro, cidade, estado, telefone, email, responsavel };
    if (tipo) patch.tipo = tipo;
    if (status !== undefined) patch.status = status;
    const enderecoMudou = endereco !== existing.endereco || numero !== existing.numero || bairro !== existing.bairro || cidade !== existing.cidade || estado !== existing.estado;
    if (enderecoMudou) {
      patch.valor_deslocamento_padrao = await calculateValorDeslocamento({ endereco, numero, bairro, cidade, estado });
    }
    const updated = await db.updateUnit(req.params.id, patch);
    res.json(updated);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Esta empresa já possui uma sede cadastrada.' });
    }
    next(err);
  }
});

router.delete('/:id', requireRole('gestor', 'analista'), async (req, res, next) => {
  try {
    const result = await db.deleteUnit(req.params.id);
    if (result.blocked) {
      return res.status(409).json({ error: 'Não é possível excluir: existem equipamentos vinculados a esta unidade' });
    }
    if (!result.deleted) {
      return res.status(404).json({ error: 'Unidade não encontrada' });
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
