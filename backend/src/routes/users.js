const express = require('express');
const db = require('../lib/db');
const { verifyToken, requireRole } = require('../lib/auth');
const { isValidEmail, normalizeEmail } = require('../lib/contact');

const router = express.Router();
router.use(verifyToken);

function sanitize(user) {
  if (!user) return user;
  const { senha_hash, ...rest } = user;
  return rest;
}

router.get('/', requireRole('gestor', 'analista'), async (req, res, next) => {
  try {
    res.json((await db.getUsers()).map(sanitize));
  } catch (err) {
    next(err);
  }
});

router.get('/me', async (req, res, next) => {
  try {
    const user = await db.getUserById(req.user.sub);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    res.json(sanitize(user));
  } catch (err) {
    next(err);
  }
});

const ROLES = ['cliente', 'tecnico', 'analista', 'gestor'];

router.patch('/:id', requireRole('gestor', 'analista'), async (req, res, next) => {
  try {
    const user = await db.getUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const { ativo, role, empresa_id, unidade_id, liberado_para_chamado, milvus_email, milvus_nome } = req.body;
    const patch = {};

    if (ativo !== undefined) {
      if (typeof ativo !== 'boolean') {
        return res.status(400).json({ error: 'Campo "ativo" deve ser boolean' });
      }
      patch.ativo = ativo;
    }
    if (liberado_para_chamado !== undefined) {
      if (typeof liberado_para_chamado !== 'boolean') {
        return res.status(400).json({ error: 'Campo "liberado_para_chamado" deve ser boolean' });
      }
      patch.liberado_para_chamado = liberado_para_chamado;
    }
    if (role !== undefined) {
      if (req.user.role !== 'gestor') {
        return res.status(403).json({ error: 'Somente o gestor pode alterar o perfil de um usuário' });
      }
      if (!ROLES.includes(role)) {
        return res.status(400).json({ error: 'Perfil inválido' });
      }
      patch.role = role;
    }
    if (milvus_email !== undefined) {
      if (req.user.role !== 'gestor') {
        return res.status(403).json({ error: 'Somente o gestor pode alterar o vínculo de usuário com o Milvus' });
      }
      const normalizedMilvusEmail = normalizeEmail(milvus_email);
      if (normalizedMilvusEmail && !isValidEmail(normalizedMilvusEmail)) {
        return res.status(400).json({ error: 'Informe um e-mail válido do usuário cadastrado no Milvus' });
      }
      if (normalizedMilvusEmail) {
        const existingMilvusUser = await db.findUserByMilvusEmail(normalizedMilvusEmail);
        if (existingMilvusUser && existingMilvusUser.id !== user.id) {
          return res.status(409).json({ error: 'Este usuário do Milvus já está vinculado a outra conta' });
        }
      }
      patch.milvus_email = normalizedMilvusEmail || null;
    }
    if (milvus_nome !== undefined) {
      if (req.user.role !== 'gestor') {
        return res.status(403).json({ error: 'Somente o gestor pode alterar o vínculo de usuário com o Milvus' });
      }
      patch.milvus_nome = String(milvus_nome || '').trim() || null;
    }
    if (empresa_id !== undefined) {
      if (empresa_id && !(await db.getCompanyById(empresa_id))) {
        return res.status(400).json({ error: 'Empresa inválida' });
      }
      patch.empresa_id = empresa_id || null;
    }
    if (unidade_id !== undefined) {
      if (unidade_id) {
        const unit = await db.getUnitById(unidade_id);
        const effectiveEmpresaId = 'empresa_id' in patch ? patch.empresa_id : user.empresa_id;
        if (!unit || unit.empresa_id !== effectiveEmpresaId) {
          return res.status(400).json({ error: 'Filial/sede inválida para esta empresa' });
        }
      }
      patch.unidade_id = unidade_id || null;
    }

    const effectiveRole = 'role' in patch ? patch.role : user.role;
    const effectiveMilvusEmail = 'milvus_email' in patch ? patch.milvus_email : user.milvus_email;
    const effectiveMilvusName = 'milvus_nome' in patch ? patch.milvus_nome : user.milvus_nome;
    if (['tecnico', 'analista'].includes(effectiveRole) && (!effectiveMilvusEmail || !effectiveMilvusName)) {
      return res.status(400).json({ error: 'Técnicos e analistas precisam ter o nome e o e-mail correspondentes ao cadastro no Milvus' });
    }
    if (!['tecnico', 'analista'].includes(effectiveRole)) {
      patch.milvus_email = null;
      patch.milvus_nome = null;
    }
    const effectiveEmpresaId = 'empresa_id' in patch ? patch.empresa_id : user.empresa_id;
    const effectiveUnidadeId = 'unidade_id' in patch ? patch.unidade_id : user.unidade_id;
    if (effectiveRole === 'cliente' && effectiveEmpresaId && !effectiveUnidadeId) {
      const empresaUnits = await db.getUnits(effectiveEmpresaId);
      if (empresaUnits.length > 1) {
        return res.status(400).json({ error: 'Esta empresa tem mais de uma filial/sede — selecione qual delas o cliente pertence.' });
      }
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    const updated = await db.updateUser(req.params.id, patch);

    if ('ativo' in patch || 'role' in patch || 'liberado_para_chamado' in patch || 'milvus_email' in patch || 'milvus_nome' in patch) {
      const mudancas = [];
      if ('ativo' in patch) mudancas.push(patch.ativo ? 'ativado' : 'desativado');
      if ('role' in patch) mudancas.push(`perfil alterado para ${patch.role}`);
      if ('liberado_para_chamado' in patch) mudancas.push(patch.liberado_para_chamado ? 'liberado para abrir chamado' : 'liberação de chamado revogada');
      if ('milvus_email' in patch) mudancas.push(patch.milvus_email ? `vinculado ao Milvus (${patch.milvus_email})` : 'vínculo com o Milvus removido');
      if ('milvus_nome' in patch && patch.milvus_nome) mudancas.push(`nome no Milvus definido como ${patch.milvus_nome}`);
      await db.logAudit({
        user: req.user,
        acao: 'usuario_alterado',
        entidade: 'user',
        entidade_id: updated.id,
        detalhes: `${updated.nome} (${updated.email}) — ${mudancas.join(', ')}`
      });
    }

    res.json(sanitize(updated));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('gestor'), async (req, res, next) => {
  try {
    if (req.params.id === req.user.sub) {
      return res.status(400).json({ error: 'Você não pode excluir sua própria conta' });
    }
    const user = await db.getUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    const result = await db.deleteUser(req.params.id);
    if (result.blocked) {
      return res.status(409).json({ error: 'Não é possível excluir: este usuário tem chamados ou orçamentos vinculados. Desative a conta em vez de excluir.' });
    }
    await db.logAudit({
      user: req.user,
      acao: 'usuario_excluido',
      entidade: 'user',
      entidade_id: req.params.id,
      detalhes: `${user.nome} (${user.email})`
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
