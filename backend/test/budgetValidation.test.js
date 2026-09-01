const test = require('node:test');
const assert = require('node:assert/strict');
const { validateTechnicalVisitBudget } = require('../src/lib/budgetValidation');

test('aceita orçamento somente com visita técnica', () => {
  assert.equal(validateTechnicalVisitBudget({ items: [], deslocamento: 180 }), null);
});

test('exige valor positivo quando o orçamento não possui peças', () => {
  assert.match(validateTechnicalVisitBudget({ items: [], deslocamento: 0 }), /maior que zero/);
});

test('aceita orçamento com peça e visita sem custo', () => {
  assert.equal(validateTechnicalVisitBudget({
    items: [{ quantidade: 1, valor_unitario: 35 }],
    deslocamento: 0
  }), null);
});

test('rejeita quantidade e valor inválidos de peça', () => {
  assert.match(validateTechnicalVisitBudget({ items: [{ quantidade: 0, valor_unitario: 35 }], deslocamento: 10 }), /quantidade/);
  assert.match(validateTechnicalVisitBudget({ items: [{ quantidade: 1, valor_unitario: -1 }], deslocamento: 10 }), /valor unitário/);
  assert.match(validateTechnicalVisitBudget({ items: [{ quantidade: 'texto', valor_unitario: 35 }], deslocamento: 10 }), /quantidade/);
});

test('rejeita valor de visita inválido', () => {
  assert.match(validateTechnicalVisitBudget({ items: [], deslocamento: 'texto' }), /valor da visita/);
});
