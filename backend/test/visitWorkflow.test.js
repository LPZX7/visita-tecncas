const test = require('node:test');
const assert = require('node:assert/strict');
const { canManagerCompleteStartedVisit, isVisitReleasedForExecution, validateVisitExecution } = require('../src/lib/visitWorkflow');

test('bloqueia o início da visita antes da aprovação do orçamento', () => {
  assert.match(validateVisitExecution({}, 'Em Atendimento'), /ainda não foi autorizada/);
});

test('permite iniciar a visita depois da aprovação do orçamento', () => {
  assert.equal(validateVisitExecution({ aprovacao_cliente: 'aprovado' }, 'Em Atendimento'), null);
});

test('gestor pode iniciar e concluir mesmo sem orçamento aprovado', () => {
  assert.equal(validateVisitExecution({}, 'Em Atendimento', 'gestor'), null);
  assert.equal(validateVisitExecution({}, 'Concluída', 'gestor'), null);
});

test('gestor consegue concluir uma visita iniciada sem orçamento', () => {
  assert.equal(canManagerCompleteStartedVisit({
    status: 'Em Atendimento',
    hora_checkin: '2026-11-11T12:00:00.000Z'
  }, 'Concluída', 'gestor'), true);
  assert.equal(canManagerCompleteStartedVisit({ status: 'Agendada' }, 'Concluída', 'gestor'), false);
  assert.equal(canManagerCompleteStartedVisit({ hora_checkin: '2026-11-11T12:00:00.000Z' }, 'Concluída', 'analista'), false);
});

test('visita agendada e vinculada ao Milvus fica liberada pela agenda', () => {
  const request = {
    status: 'Agendada',
    agendado_para: '2026-11-15T10:00',
    milvus_codigo: 'MV-123'
  };

  assert.equal(isVisitReleasedForExecution(request), true);
  assert.equal(validateVisitExecution(request, 'Em Atendimento', 'tecnico'), null);
});

test('técnico consegue concluir sem orçamento depois que a visita foi iniciada', () => {
  const startedRequest = {
    status: 'Em Atendimento',
    hora_checkin: '2026-11-11T12:00:00.000Z',
    milvus_codigo: 'MV-123'
  };

  assert.equal(isVisitReleasedForExecution(startedRequest), true);
  assert.equal(validateVisitExecution(startedRequest, 'Concluída', 'tecnico'), null);
});

test('agenda não libera visita sem data ou com orçamento recusado', () => {
  assert.equal(isVisitReleasedForExecution({ status: 'Agendada', milvus_codigo: 'MV-123' }), false);
  const rejectedRequest = {
    status: 'Agendada',
    agendado_para: '2026-11-15T10:00',
    milvus_codigo: 'MV-123',
    aprovacao_cliente: 'recusado'
  };
  assert.equal(isVisitReleasedForExecution(rejectedRequest), false);
  assert.match(validateVisitExecution(rejectedRequest, 'Em Atendimento', 'tecnico'), /ainda não foi autorizada/);
});

test('permite agendar enquanto o orçamento aguarda aprovação', () => {
  assert.equal(validateVisitExecution({}, 'Agendada'), null);
});

test('impede concluir atendimento que não foi autorizado', () => {
  assert.match(validateVisitExecution({ aprovacao_cliente: 'recusado' }, 'Concluída'), /ainda não foi autorizada/);
});
