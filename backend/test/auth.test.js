const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/lib/db');
const { signToken, verifyToken } = require('../src/lib/auth');

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('verifyToken usa permissões atuais do banco', async () => {
  const original = db.getUserById;
  db.getUserById = async () => ({
    id: 'u1', ativo: true, role: 'cliente', empresa_id: 'empresa-atual',
    unidade_id: 'unidade-atual', nome: 'Usuário Atual', email: 'atual@example.com'
  });
  try {
    const token = signToken({ id: 'u1', ativo: true, role: 'gestor', nome: 'Antigo', email: 'antigo@example.com' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = responseRecorder();
    let nextCalled = false;
    await verifyToken(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(req.user.role, 'cliente');
    assert.equal(req.user.empresa_id, 'empresa-atual');
    assert.equal(req.user.name, 'Usuário Atual');
  } finally {
    db.getUserById = original;
  }
});

test('verifyToken rejeita usuário desativado imediatamente', async () => {
  const original = db.getUserById;
  db.getUserById = async () => ({ id: 'u2', ativo: false });
  try {
    const token = signToken({ id: 'u2', ativo: true, role: 'cliente', nome: 'Teste', email: 'teste@example.com' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = responseRecorder();
    let nextCalled = false;
    await verifyToken(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
  } finally {
    db.getUserById = original;
  }
});
