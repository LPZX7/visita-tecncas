const test = require('node:test');
const assert = require('node:assert/strict');
const {
  analyzeMilvusBudget,
  detectPartsFromText,
  extractReasonFromText,
  matchCompanyFromTicket,
  matchEquipmentFromTicket,
  matchUnitFromTicket
} = require('../src/lib/milvusDraft');
const { resolveAutomaticTicket } = require('../src/lib/milvusImportService');

const parts = [
  { id: 'braco', codigo: 'CATR-BRACO', nome: 'Braço da catraca', preco_unitario: 200 },
  { id: 'inox', codigo: 'CATR-BRACO-INOX', nome: 'Braço de catraca em aço inox', preco_unitario: 0 },
  { id: 'mola', codigo: 'CATR-MOLA', nome: 'Mola de retorno do braço', preco_unitario: 35 },
  { id: 'sensor', codigo: 'CATR-SENSOR-OPTICO', nome: 'Sensor óptico de posição', preco_unitario: 80 }
];

test('identifica peças, quantidades e evita duplicidade por termos sobrepostos', () => {
  const detected = detectPartsFromText('Trocar 2 molas e um braço inox da catraca.', parts);

  assert.deepEqual(detected.map(({ part, quantidade }) => [part.id, quantidade]), [
    ['mola', 2],
    ['inox', 1]
  ]);
});

test('extrai motivo explícito sem inventar quando ele não existe', () => {
  assert.equal(
    extractReasonFromText('Trocar sensor óptico. Motivo da troca: falha intermitente na leitura.'),
    'falha intermitente na leitura'
  );
  assert.equal(extractReasonFromText('Trocar sensor óptico de posição.'), null);
});

test('leva o conteúdo do Milvus para o orçamento em rascunho', () => {
  const analysis = analyzeMilvusBudget({
    assunto: 'Troca de sensor',
    descricao: '<p>Peça: sensor óptico.</p><p>Causa: componente queimado.</p>'
  }, parts);

  assert.equal(analysis.items[0].peca_id, 'sensor');
  assert.equal(analysis.motivo_troca, 'componente queimado');
  assert.match(analysis.observacoes_tecnicas, /Peça: sensor óptico/);
  assert.doesNotMatch(analysis.observacoes_tecnicas, /<p>/);
});

test('mapeia empresa, filial e equipamento somente quando o resultado é único', () => {
  const companies = [
    { id: 'c1', razao_social: 'Empresa X', email: 'matriz@empresa.com.br' },
    { id: 'c2', razao_social: 'Outra Empresa', email: 'contato@outra.com.br' }
  ];
  const units = [{ id: 'u1', empresa_id: 'c1', nome: 'Filial Centro', email: 'centro@empresa.com.br', status: 'ativo' }];
  const equipments = [
    { id: 'e1', empresa_id: 'c1', unidade_id: 'u1', modelo: 'Catraca Revolution', numero_serie: 'REV-123' },
    { id: 'e2', empresa_id: 'c2', modelo: 'Totem Meep', numero_serie: 'MEEP-9' }
  ];
  const ticket = {
    cliente_nome: 'Empresa X - Filial Centro',
    cliente_email: 'centro@empresa.com.br',
    assunto: 'Revolution com falha',
    descricao: 'Trocar sensor óptico. Motivo: falha de leitura.'
  };

  const company = matchCompanyFromTicket(ticket, companies, units);
  const unit = matchUnitFromTicket(ticket, company, units);
  const equipment = matchEquipmentFromTicket(ticket, company, unit, equipments);
  assert.equal(company.id, 'c1');
  assert.equal(unit.id, 'u1');
  assert.equal(equipment.id, 'e1');

  const resolution = resolveAutomaticTicket(ticket, { companies, units, equipments, parts });
  assert.equal(resolution.ready, true);
  assert.equal(resolution.analysis.items[0].peca_id, 'sensor');
});

test('mantém para revisão quando existem dois equipamentos igualmente possíveis', () => {
  const company = { id: 'c1', razao_social: 'Empresa X', email: 'cliente@empresa.com.br' };
  const ticket = { cliente_nome: 'Empresa X', cliente_email: 'cliente@empresa.com.br', descricao: 'Trocar mola da catraca.' };
  const equipments = [
    { id: 'e1', empresa_id: 'c1', modelo: 'Catraca A', numero_serie: 'A-1' },
    { id: 'e2', empresa_id: 'c1', modelo: 'Catraca B', numero_serie: 'B-1' }
  ];

  assert.equal(matchEquipmentFromTicket(ticket, company, null, equipments), null);
  const resolution = resolveAutomaticTicket(ticket, { companies: [company], units: [], equipments, parts });
  assert.equal(resolution.ready, false);
  assert.match(resolution.reason, /equipamento/i);
});

test('motivo ausente não impede a criação automática do rascunho', () => {
  const company = { id: 'c1', razao_social: 'Empresa X', email: 'cliente@empresa.com.br' };
  const equipment = { id: 'e1', empresa_id: 'c1', modelo: 'Catraca Revolution', numero_serie: 'REV-1' };
  const ticket = {
    cliente_nome: 'Empresa X',
    cliente_email: 'cliente@empresa.com.br',
    assunto: 'Trocar mola da catraca'
  };

  const resolution = resolveAutomaticTicket(ticket, {
    companies: [company],
    units: [],
    equipments: [equipment],
    parts
  });
  assert.equal(resolution.ready, true);
  assert.equal(resolution.analysis.motivo_troca, null);
  assert.equal(resolution.analysis.items[0].peca_id, 'mola');
});

test('serviço sem peça pode ser importado quando o analista informa claramente o que fazer', () => {
  const company = { id: 'c1', razao_social: 'Empresa X', email: 'cliente@empresa.com.br' };
  const equipment = { id: 'e1', empresa_id: 'c1', modelo: 'Catraca Revolution', numero_serie: 'REV-1' };
  const ticket = {
    cliente_nome: 'Empresa X',
    cliente_email: 'cliente@empresa.com.br',
    assunto: 'Mudança de local',
    descricao: 'Mover a catraca da recepção para a entrada lateral.'
  };

  const resolution = resolveAutomaticTicket(ticket, {
    companies: [company], units: [], equipments: [equipment], parts
  });
  assert.equal(resolution.ready, true);
  assert.deepEqual(resolution.analysis.items, []);
  assert.match(resolution.analysis.plano_tecnico.objective, /Mover a catraca/i);
});
