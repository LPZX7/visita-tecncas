const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/lib/db');
const milvus = require('../src/lib/milvus');
const importService = require('../src/lib/milvusImportService');
const { autoImportMilvusPendentes } = importService;

test('sincronização importa para Chamados sem equipamento ou email e devolve o ID', async (t) => {
  const original = {};
  const pending = {
    id: 'pending-1',
    milvus_codigo: '7228',
    cliente_nome: 'Empresa X',
    cliente_email: 'email incompleto',
    assunto: 'Solicitação de visita técnica',
    descricao: 'Verificar o equipamento no local.'
  };
  const company = { id: 'company-1', razao_social: 'Empresa X', email: null };
  let createdRequest;
  let createdBudget;

  const replacements = {
    releaseStaleMilvusClaims: async () => {},
    getMilvusPendentes: async () => [pending],
    getCompanies: async () => [company],
    getUnits: async () => [],
    getEquipments: async () => [],
    getParts: async () => [],
    getUsers: async () => [],
    getCompanyById: async () => company,
    claimMilvusPendente: async () => true,
    createRequest: async (request) => {
      createdRequest = { id: 'request-from-milvus', ...request };
      return createdRequest;
    },
    createBudget: async (budget) => {
      createdBudget = { id: 'budget-1', ...budget };
      return createdBudget;
    },
    updateBudget: async (id, patch) => ({ ...createdBudget, ...patch, id }),
    updateMilvusPendente: async () => pending,
    logAudit: async () => {}
  };

  for (const [key, replacement] of Object.entries(replacements)) {
    original[key] = db[key];
    db[key] = replacement;
  }
  t.after(() => Object.assign(db, original));

  const result = await autoImportMilvusPendentes();

  assert.equal(result.importados, 1);
  assert.equal(result.aguardando_revisao, 0);
  assert.deepEqual(result.request_ids, ['request-from-milvus']);
  assert.equal(createdRequest.empresa_id, company.id);
  assert.equal(createdRequest.equipamento_id, null);
  assert.equal(createdRequest.solicitante_email, null);
  assert.equal(createdRequest.unidade_id, null);
  assert.deepEqual(createdBudget.request_id, 'request-from-milvus');
});

test('sincronização devolve os chamados criados para a tela Chamados', async (t) => {
  const originalPendingLookup = db.getMilvusPendentesByCodigos;
  const originalListTickets = milvus.listarChamadosVisitaTecnica;
  const originalAutoImport = importService.autoImportMilvusPendentes;
  const syncModulePath = require.resolve('../src/lib/milvusSync');
  delete require.cache[syncModulePath];
  t.after(() => {
    db.getMilvusPendentesByCodigos = originalPendingLookup;
    milvus.listarChamadosVisitaTecnica = originalListTickets;
    importService.autoImportMilvusPendentes = originalAutoImport;
    delete require.cache[syncModulePath];
  });

  db.getMilvusPendentesByCodigos = async () => [];
  milvus.listarChamadosVisitaTecnica = async () => [];
  importService.autoImportMilvusPendentes = async () => ({
    importados: 1,
    aguardando_revisao: 0,
    request_ids: ['request-from-milvus']
  });

  const { syncMilvusChamados } = require('../src/lib/milvusSync');
  const result = await syncMilvusChamados();

  assert.equal(result.importados_automaticamente, 1);
  assert.deepEqual(result.chamados_importados, ['request-from-milvus']);
});
