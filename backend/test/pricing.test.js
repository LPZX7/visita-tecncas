const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calculateBudgetTotal } = require('../src/lib/pricing');

test('soma peças e deslocamento corretamente', () => {
  const result = calculateBudgetTotal({
    items: [
      { valor_unitario: 100, quantidade: 2 },
      { valor_unitario: 50, quantidade: 1 }
    ],
    deslocamento: 30
  });
  assert.equal(result.pecasTotal, 250);
  assert.equal(result.deslocamentoTotal, 30);
  assert.equal(result.total, 280);
});

test('funciona sem peças (só deslocamento)', () => {
  const result = calculateBudgetTotal({ items: [], deslocamento: 45 });
  assert.equal(result.pecasTotal, 0);
  assert.equal(result.total, 45);
});

test('funciona sem deslocamento informado', () => {
  const result = calculateBudgetTotal({ items: [{ valor_unitario: 10, quantidade: 3 }] });
  assert.equal(result.pecasTotal, 30);
  assert.equal(result.deslocamentoTotal, 0);
  assert.equal(result.total, 30);
});

test('trata deslocamento não numérico como zero', () => {
  const result = calculateBudgetTotal({ items: [], deslocamento: 'abc' });
  assert.equal(result.deslocamentoTotal, 0);
});

test('orçamento vazio (sem peças, sem deslocamento) totaliza zero', () => {
  const result = calculateBudgetTotal({});
  assert.equal(result.total, 0);
});
