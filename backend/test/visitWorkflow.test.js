const test = require('node:test');
const assert = require('node:assert/strict');
const { validateVisitExecution } = require('../src/lib/visitWorkflow');

test('bloqueia o início da visita antes da aprovação do orçamento', () => {
  assert.match(validateVisitExecution({}, 'Em Atendimento'), /ainda não foi autorizada/);
});

test('permite iniciar a visita depois da aprovação do orçamento', () => {
  assert.equal(validateVisitExecution({ aprovacao_cliente: 'aprovado' }, 'Em Atendimento'), null);
});

test('permite agendar enquanto o orçamento aguarda aprovação', () => {
  assert.equal(validateVisitExecution({}, 'Agendada'), null);
});

test('impede concluir atendimento que não foi autorizado', () => {
  assert.match(validateVisitExecution({ aprovacao_cliente: 'recusado' }, 'Concluída'), /ainda não foi autorizada/);
});
