const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeProduct } = require('../src/lib/bomControle');

test('normaliza produto e saldo do BomControle', () => {
  assert.deepEqual(normalizeProduct({ Id: 414, Nome: ' Braço ', Quantidade: 7.9, Valor: 123.45 }), {
    bomcontrole_id: 414,
    codigo: 'BC-414',
    nome: 'Braço',
    categoria: 'BomControle',
    preco_unitario: 123.45,
    estoque: 7,
    fornecedor: null
  });
});

test('ignora registros inválidos e protege números do estoque', () => {
  assert.equal(normalizeProduct({ Id: null, Nome: '' }), null);
  const product = normalizeProduct({ Id: 1, Nome: 'Teste', Quantidade: -3, Valor: 'inválido' });
  assert.equal(product.estoque, 0);
  assert.equal(product.preco_unitario, 0);
});
