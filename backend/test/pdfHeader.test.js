const test = require('node:test');
const assert = require('node:assert/strict');
const { money } = require('../src/lib/pdfHeader');

test('formata valores dos PDFs no padrão brasileiro', () => {
  assert.equal(money(450), 'R$ 450,00');
  assert.equal(money(1234.5), 'R$ 1.234,50');
});
