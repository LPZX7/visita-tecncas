const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeEmail, isValidEmail, resolveContactEmail } = require('../src/lib/contact');

test('normaliza e valida email de contato', () => {
  assert.equal(normalizeEmail('  CLIENTE@EXEMPLO.COM '), 'cliente@exemplo.com');
  assert.equal(isValidEmail('cliente@exemplo.com'), true);
  assert.equal(isValidEmail('cliente sem email'), false);
});

test('prioriza email informado e usa cadastros como fallback', () => {
  assert.equal(resolveContactEmail({
    provided: 'novo@cliente.com',
    request: { solicitante_email: 'antigo@cliente.com' },
    company: { email: 'empresa@cliente.com' }
  }), 'novo@cliente.com');
  assert.equal(resolveContactEmail({ unit: { email: 'filial@cliente.com' }, company: { email: 'empresa@cliente.com' } }), 'filial@cliente.com');
});
