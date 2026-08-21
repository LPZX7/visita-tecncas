const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildAutomaticServiceReport, buildCompletionSummary, buildCompletionEmail } = require('../src/lib/visitCompletion');

test('monta o serviço realizado automaticamente a partir das peças aprovadas', () => {
  assert.equal(
    buildAutomaticServiceReport([{ nome: 'Placa eletrônica', quantidade: 1 }]),
    'Foi substituída 1 unidade de placa eletrônica.'
  );
  assert.equal(buildAutomaticServiceReport([]), 'Atendimento concluído no local.');
});

test('resumo sem adicional mantém a observação opcional', () => {
  const summary = buildCompletionSummary({
    request: {
      descricao: 'Equipamento travando',
      relatorio_visita: 'Limpeza e regulagem do equipamento.',
      teve_adicional: false,
      observacao_final: 'Cliente acompanhou os testes.',
      hora_checkout: '2026-08-21T21:38:00.000Z'
    },
    approvedParts: [],
    technician: 'Felipe'
  });

  assert.match(summary, /Serviço realizado\n\nLimpeza e regulagem/);
  assert.match(summary, /Observações finais\n\nCliente acompanhou/);
  assert.match(summary, /Atendimento concluído por Felipe em 21\/08\/2026 às 18:38/);
  assert.doesNotMatch(summary, /Houve peça|Item ou custo adicional/);
});

test('resumo com adicional lista peças e valor informado', () => {
  const summary = buildCompletionSummary({
    request: {
      descricao: 'Falha de alimentação',
      relatorio_visita: 'Substituição e testes.',
      teve_adicional: true,
      adicional_descricao: 'Cabo de alimentação adicional',
      custo_adicional: 85.5
    },
    approvedParts: [{ nome: 'Placa eletrônica', quantidade: 2 }]
  });

  assert.match(summary, /Placa eletrônica — 2 unidades/);
  assert.match(summary, /Cabo de alimentação adicional/);
  assert.match(summary, /R\$\s*85,50/);
});

test('resumo para PDF omite emoji sem perder o status', () => {
  const summary = buildCompletionSummary({
    request: { descricao: 'Falha', relatorio_visita: 'Teste concluído.' },
    includeStatusIcon: false
  });

  assert.match(summary, /Status\n\nVisita concluída/);
  assert.doesNotMatch(summary, /🟢/);
});

test('email escapa conteúdo informado pelo técnico', () => {
  const email = buildCompletionEmail({
    request: { numero: 10, descricao: 'Falha', relatorio_visita: '<script>alert(1)</script>', teve_adicional: false },
    company: { razao_social: 'Cliente & Filhos' },
    approvedParts: [],
    portalUrl: 'https://exemplo.test/requests'
  });

  assert.match(email.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(email.html, /<script>/);
  assert.match(email.subject, /chamado #10/);
});
