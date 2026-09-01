const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTechnicalPlan, extractExplicitTasks } = require('../src/lib/technicalPlan');

test('transforma a troca informada no Milvus em um plano claro para o técnico', () => {
  const plan = buildTechnicalPlan({
    sourceText: 'Trocar 2 braços da catraca. Motivo: braços empenados.',
    budget: { motivo_troca: 'braços empenados' },
    items: [{ nome: 'Braço da catraca', quantidade: 2 }]
  });

  assert.match(plan.objective, /Substituir 2 unidades de braço da catraca/i);
  assert.equal(plan.parts[0].quantidade, 2);
  assert.match(plan.tasks.join(' '), /testar o funcionamento/i);
  assert.equal(plan.reason, 'braços empenados');
});

test('entende serviço sem peça, como mudança de local da catraca', () => {
  const plan = buildTechnicalPlan({ sourceText: 'Mover a catraca da recepção para a entrada lateral.', items: [] });
  assert.equal(plan.explicitInstruction, true);
  assert.match(plan.objective, /Mover a catraca/i);
  assert.deepEqual(plan.parts, []);
});

test('não inventa uma orientação específica quando o ticket está vago', () => {
  assert.deepEqual(extractExplicitTasks('Catraca com problema.'), []);
  const plan = buildTechnicalPlan({ sourceText: 'Catraca com problema.', items: [] });
  assert.equal(plan.explicitInstruction, false);
  assert.match(plan.objective, /conforme a descrição do chamado/i);
});
