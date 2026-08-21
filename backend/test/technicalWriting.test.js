const test = require('node:test');
const assert = require('node:assert/strict');
const { formatDateTime, isRepeated, partWithQuantity, sentence } = require('../src/lib/technicalWriting');

test('corrige apenas forma, pontuação e erros comuns sem inventar conteúdo', () => {
  assert.equal(sentence('  fonte de alimentacao foi queimada  '), 'Fonte de alimentação estava queimada.');
  assert.equal(sentence('cliente nao acompanhou o teste'), 'Cliente não acompanhou o teste.');
  assert.equal(sentence('adicional de R$ 35,50;cliente aprovou'), 'Adicional de R$ 35,50; cliente aprovou.');
});

test('formata quantidades e horário do registro de forma determinística', () => {
  assert.equal(partWithQuantity({ nome: 'Fonte de alimentação', quantidade: 1 }), 'Fonte de alimentação — 1 unidade');
  assert.equal(partWithQuantity({ nome: 'Sensor', quantidade: 2 }), 'Sensor — 2 unidades');
  assert.equal(formatDateTime('2026-08-21T21:38:00.000Z'), '21/08/2026 às 18:38');
});

test('identifica repetição literal ou conteúdo já contido em outro campo', () => {
  assert.equal(isRepeated('Fonte estava queimada.', ['A fonte estava queimada.']), true);
  assert.equal(isRepeated('A fonte estava queimada.', ['A fonte estava queimada.']), true);
});
