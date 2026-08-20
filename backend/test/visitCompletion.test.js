const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildAutomaticServiceReport, buildCompletionSummary, buildCompletionEmail } = require('../src/lib/visitCompletion');

test('monta o serviço realizado automaticamente a partir das peças aprovadas', () => {
  assert.equal(
    buildAutomaticServiceReport([{ nome: 'Placa eletrônica', quantidade: 1 }]),
    'Substituição de Placa eletrônica e conclusão do atendimento técnico no local.'
  );
  assert.equal(buildAutomaticServiceReport([]), 'Atendimento técnico realizado e concluído no local.');
});

test('resumo sem adicional mantém a observação opcional', () => {
  const summary = buildCompletionSummary({
    request: {
      relatorio_visita: 'Limpeza e regulagem do equipamento.',
      teve_adicional: false,
      observacao_final: 'Cliente acompanhou os testes.'
    },
    approvedParts: []
  });

  assert.match(summary, /Serviço realizado: Limpeza e regulagem/);
  assert.match(summary, /Houve peça ou custo adicional: Não/);
  assert.match(summary, /Observação do técnico: Cliente acompanhou/);
  assert.doesNotMatch(summary, /Item\/custo adicional informado/);
});

test('resumo com adicional lista peças e valor informado', () => {
  const summary = buildCompletionSummary({
    request: {
      relatorio_visita: 'Substituição e testes.',
      teve_adicional: true,
      adicional_descricao: 'Cabo de alimentação adicional',
      custo_adicional: 85.5
    },
    approvedParts: [{ nome: 'Placa eletrônica', quantidade: 2 }]
  });

  assert.match(summary, /Placa eletrônica \(x2\)/);
  assert.match(summary, /Cabo de alimentação adicional/);
  assert.match(summary, /R\$\s*85,50/);
});

test('email escapa conteúdo informado pelo técnico', () => {
  const email = buildCompletionEmail({
    request: { numero: 10, relatorio_visita: '<script>alert(1)</script>', teve_adicional: false },
    company: { razao_social: 'Cliente & Filhos' },
    approvedParts: [],
    portalUrl: 'https://exemplo.test/requests'
  });

  assert.match(email.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(email.html, /<script>/);
  assert.match(email.subject, /chamado #10/);
});
