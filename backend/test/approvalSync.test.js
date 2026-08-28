const test = require('node:test');
const assert = require('node:assert/strict');
const { buildVisitApprovalPatchFromBudget } = require('../src/lib/approvalSync');

test('aprovação do orçamento gera a aprovação equivalente da visita', () => {
  const patch = buildVisitApprovalPatchFromBudget({
    status: 'Aprovado',
    aprovado_em: '2026-08-28T18:00:00.000Z',
    aprovacao_nome: 'João Cliente',
    aprovacao_cpf: '123.456.789-00',
    aprovacao_telefone: '(11) 99999-9999'
  });

  assert.deepEqual(patch, {
    aprovacao_cliente: 'aprovado',
    data_aprovacao_cliente: '2026-08-28T18:00:00.000Z',
    aprovacao_nome: 'João Cliente',
    aprovacao_cpf: '123.456.789-00',
    aprovacao_telefone: '(11) 99999-9999'
  });
});

test('não permite sincronizar visita a partir de orçamento não aprovado', () => {
  assert.throws(
    () => buildVisitApprovalPatchFromBudget({ status: 'Enviado' }),
    /Somente um orçamento aprovado/
  );
});
