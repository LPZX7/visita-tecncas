const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildDescricao, buildRealizado, buildMilvusPayload, TITULO_VISITA_TECNICA } = require('../src/lib/visitaTecnicaFormat');

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

test('buildDescricao inclui todos os campos obrigatórios da regra 1', () => {
  const texto = buildDescricao({ budget, items, request });
  assert.match(texto, /Peça: Placa eletrônica/);
  assert.match(texto, /Motivo da troca: Placa queimada após surto de energia/);
  assert.doesNotMatch(texto, /Serviço a ser realizado/);
  assert.match(texto, /Informações relevantes: Equipamento também apresentava fiação desgastada/);
  assert.match(texto, /Valor da peça: R\$ 450\.00/);
  assert.match(texto, /Valor da visita técnica: R\$ 150\.00/);
  assert.match(texto, /Valor total: R\$ 600\.00/);
});

test('buildRealizado segue o formato do exemplo', () => {
  const texto = buildRealizado(items);
  assert.equal(texto, 'REALIZADO: Substituição da peça Placa eletrônica e realização dos procedimentos técnicos necessários para conclusão do serviço.');
});

test('buildMilvusPayload sempre usa o título fixo VISITA TÉCNICA', () => {
  const payload = buildMilvusPayload({ budget, items, request });
  assert.equal(payload.assunto, 'VISITA TÉCNICA');
  assert.equal(TITULO_VISITA_TECNICA, 'VISITA TÉCNICA');
});

test('buildMilvusPayload inclui REALIZADO, STATUS e AUTORIZAÇÃO', () => {
  const payload = buildMilvusPayload({ budget, items, request });
  assert.match(payload.descricao, /REALIZADO: Substituição da peça Placa eletrônica/);
  assert.match(payload.descricao, /STATUS: APROVADO PELO CLIENTE/);
  assert.match(payload.descricao, /AUTORIZAÇÃO: Cliente autorizou a realização da visita técnica e a substituição da peça\./);
  assert.match(payload.descricao, /Autorizado por Maria Autorizante \(CPF 123\.456\.789-00, tel \(11\) 91234-5678\)/);
});
