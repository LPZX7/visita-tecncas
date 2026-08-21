const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildDescricao, buildAuthorizedService, buildMilvusPayload, TITULO_VISITA_TECNICA } = require('../src/lib/visitaTecnicaFormat');

const budget = {
  motivo_troca: 'Placa queimada após surto de energia',
  observacoes_tecnicas: 'Equipamento também apresentava fiação desgastada',
  pecas_total: 450,
  deslocamento: 150,
  total: 600,
  autorizado_por: 'Cliente via portal (usuário logado)',
  aprovacao_nome: 'Maria Autorizante',
  aprovacao_cpf: '123.456.789-00',
  aprovacao_telefone: '(11) 91234-5678',
  aprovado_em: '2026-08-11T12:00:00.000Z'
};

const items = [{ nome: 'Placa eletrônica', quantidade: 1, valor_unitario: 450 }];
const request = { descricao: 'Ar-condicionado não está funcionando' };

test('buildDescricao organiza o registro em blocos naturais sem concatenar campos', () => {
  const texto = buildDescricao({ budget, items, request });
  assert.match(texto, /Problema identificado\n\nAr-condicionado não está funcionando\./);
  assert.match(texto, /Motivo da troca\n\nPlaca queimada após surto de energia\./);
  assert.match(texto, /Peça autorizada\n\nPlaca eletrônica — 1 unidade/);
  assert.match(texto, /Informações do atendimento\n\nEquipamento também apresentava fiação desgastada\./);
  assert.match(texto, /Visita técnica: R\$ 150,00/);
  assert.match(texto, /Peças: R\$ 450,00/);
  assert.match(texto, /Total: R\$ 600,00/);
  assert.doesNotMatch(texto, /não informado|nenhuma|REALIZADO:/);
});

test('serviço aprovado não é descrito incorretamente como já realizado', () => {
  const texto = buildAuthorizedService(items);
  assert.equal(texto, 'Foi autorizada a substituição de 1 unidade de placa eletrônica.');
  assert.equal(buildAuthorizedService([]), 'O cliente autorizou a realização da visita técnica.');
  assert.doesNotMatch(texto, /procedimentos técnicos necessários|conclusão do serviço|realizado/i);
});

test('buildMilvusPayload sempre usa o título fixo VISITA TÉCNICA', () => {
  const payload = buildMilvusPayload({ budget, items, request });
  assert.equal(payload.assunto, 'VISITA TÉCNICA');
  assert.equal(TITULO_VISITA_TECNICA, 'VISITA TÉCNICA');
});

test('buildMilvusPayload usa status e autorização em blocos humanos', () => {
  const payload = buildMilvusPayload({ budget, items, request });
  assert.match(payload.descricao, /Status\n\n🟢 Aprovado pelo cliente/);
  assert.match(payload.descricao, /Autorização\n\nO cliente autorizou/);
  assert.match(payload.descricao, /Autorizado por Maria Autorizante em 11\/08\/2026 às 09:00\./);
  assert.doesNotMatch(payload.descricao, /CPF|tel|STATUS:|AUTORIZAÇÃO:/);
});
