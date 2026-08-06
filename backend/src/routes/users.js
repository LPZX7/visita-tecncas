const express = require('express');
const db = require('../lib/db');
const { verifyToken, requireRole } = require('../lib/auth');

const router = express.Router();
router.use(verifyToken);

function sanitize(user) {
  if (!user) return user;
  const { senha_hash, ...rest } = user;
  return rest;
}

router.get('/', requireRole('gestor', 'analista'), (req, res) => {
  res.json(db.getUsers().map(sanitize));
});

router.get('/me', (req, res) => {
  const user = db.getUserById(req.user.sub);
  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado' });
  }
  res.json(sanitize(user));
});

const ROLES = ['cliente', 'tecnico', 'analista', 'gestor'];

router.patch('/:id', requireRole('gestor', 'analista'), (req, res) => {
  const user = db.getUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado' });
  }

  const { ativo, role, empresa_id } = req.body;
  const patch = {};

  if (ativo !== undefined) {
    if (typeof ativo !== 'boolean') {
      return res.status(400).json({ error: 'Campo "ativo" deve ser boolean' });
    }
    patch.ativo = ativo;
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
  if (empresa_id !== undefined) {
    if (empresa_id && !db.getCompanyById(empresa_id)) {
      return res.status(400).json({ error: 'Empresa inválida' });
    }
    patch.empresa_id = empresa_id || null;
  }

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'Nenhum campo para atualizar' });
  }

  const updated = db.updateUser(req.params.id, patch);
  res.json(sanitize(updated));
});

module.exports = router;
