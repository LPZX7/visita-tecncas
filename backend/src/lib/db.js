const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');

const dbDir = process.env.DATA_DIR || path.resolve(__dirname, '../../data');
const dbPath = path.join(dbDir, 'mirontec.db');

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    empresa_id TEXT,
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS empresas (
    id TEXT PRIMARY KEY,
    razao_social TEXT NOT NULL,
    nome_fantasia TEXT,
    cnpj TEXT NOT NULL,
    endereco TEXT NOT NULL,
    telefone TEXT,
    email TEXT,
    responsavel TEXT,
    modelo_cobranca TEXT,
    status TEXT NOT NULL DEFAULT 'ativo',
    criado_em TEXT NOT NULL,
    atualizado_em TEXT
  );

  CREATE TABLE IF NOT EXISTS equipamentos (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL REFERENCES empresas(id),
    modelo TEXT NOT NULL,
    numero_serie TEXT NOT NULL,
    local_instalacao TEXT,
    data_instalacao TEXT,
    garantia_ate TEXT,
    criado_em TEXT NOT NULL,
    atualizado_em TEXT
  );

  CREATE TABLE IF NOT EXISTS pecas (
    id TEXT PRIMARY KEY,
    codigo TEXT NOT NULL,
    nome TEXT NOT NULL,
    categoria TEXT NOT NULL,
    preco_unitario REAL NOT NULL,
    estoque INTEGER NOT NULL DEFAULT 0,
    fornecedor TEXT,
    criado_em TEXT NOT NULL,
    atualizado_em TEXT
  );

  CREATE TABLE IF NOT EXISTS regras_cobranca (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL,
    tipo TEXT NOT NULL,
    valor_base REAL NOT NULL,
    visitas_incluidas INTEGER NOT NULL DEFAULT 0,
    criado_em TEXT NOT NULL,
    atualizado_em TEXT
  );

  CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    numero INTEGER,
    empresa_id TEXT NOT NULL REFERENCES empresas(id),
    equipamento_id TEXT NOT NULL REFERENCES equipamentos(id),
    descricao TEXT NOT NULL,
    urgencia TEXT NOT NULL DEFAULT 'Normal',
    endereco TEXT,
    status TEXT NOT NULL DEFAULT 'Aberta',
    assigned_technician TEXT,
    agendado_para TEXT,
    hora_checkin TEXT,
    hora_checkout TEXT,
    relatorio_visita TEXT,
    avaliacao INTEGER,
    avaliacao_comentario TEXT,
    aberto_por TEXT,
    criado_em TEXT NOT NULL,
    atualizado_em TEXT,
    concluded_at TEXT
  );

  CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL REFERENCES requests(id),
    draft_by TEXT,
    regra_cobranca_id TEXT NOT NULL REFERENCES regras_cobranca(id),
    base_total REAL NOT NULL DEFAULT 0,
    pecas_total REAL NOT NULL DEFAULT 0,
    mao_obra_total REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Rascunho',
    deslocamento REAL NOT NULL DEFAULT 0,
    urgencia REAL NOT NULL DEFAULT 0,
    horas_trabalho REAL NOT NULL DEFAULT 0,
    criado_em TEXT NOT NULL,
    atualizado_em TEXT
  );

  CREATE TABLE IF NOT EXISTS orcamento_itens (
    id TEXT PRIMARY KEY,
    orcamento_id TEXT NOT NULL REFERENCES budgets(id),
    peca_id TEXT,
    valor_unitario REAL NOT NULL,
    quantidade INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS contratos (
    id TEXT PRIMARY KEY,
    numero TEXT NOT NULL UNIQUE,
    orcamento_id TEXT NOT NULL UNIQUE REFERENCES budgets(id),
    empresa_id TEXT NOT NULL REFERENCES empresas(id),
    request_id TEXT NOT NULL REFERENCES requests(id),
    valor_total REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'Ativo',
    criado_em TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notificacoes (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL REFERENCES empresas(id),
    titulo TEXT NOT NULL,
    mensagem TEXT,
    link TEXT,
    lida INTEGER NOT NULL DEFAULT 0,
    criado_em TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_equipamentos_empresa ON equipamentos(empresa_id);
  CREATE INDEX IF NOT EXISTS idx_requests_empresa ON requests(empresa_id);
  CREATE INDEX IF NOT EXISTS idx_budgets_request ON budgets(request_id);
  CREATE INDEX IF NOT EXISTS idx_itens_orcamento ON orcamento_itens(orcamento_id);
  CREATE INDEX IF NOT EXISTS idx_contratos_empresa ON contratos(empresa_id);
  CREATE INDEX IF NOT EXISTS idx_notificacoes_empresa ON notificacoes(empresa_id);
`);

function now() {
  return new Date().toISOString();
}

function withDefaults(obj) {
  const out = {};
  for (const key of Object.keys(obj)) {
    out[key] = obj[key] === undefined ? null : obj[key];
  }
  return out;
}

function toUser(row) {
  if (!row) return null;
  return { ...row, ativo: !!row.ativo };
}

function seedDefaultAdmin() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count > 0) return;
  const email = process.env.ADMIN_EMAIL || 'admin@empresa.com';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  if (!process.env.ADMIN_PASSWORD) {
    console.warn('[aviso] ADMIN_PASSWORD não definido — usando senha padrão insegura "admin123". Configure ADMIN_PASSWORD antes de ir para produção.');
  }
  db.prepare(
    'INSERT INTO users (id, nome, email, senha_hash, role, empresa_id, ativo, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(uuid(), 'Administrador', email, bcrypt.hashSync(password, 10), 'gestor', null, 1, now());
}

seedDefaultAdmin();

// ---------- generic partial-update helper ----------

function updateRow(table, id, patch, { touchUpdatedAt = true } = {}) {
  const fields = { ...patch };
  if (touchUpdatedAt) fields.atualizado_em = now();

  const keys = Object.keys(fields);
  if (keys.length === 0) return;

  const setClause = keys.map((key) => `${key} = ?`).join(', ');
  const values = keys.map((key) => (fields[key] === undefined ? null : fields[key]));
  db.prepare(`UPDATE ${table} SET ${setClause} WHERE id = ?`).run(...values, id);
}

function safeDelete(table, id) {
  try {
    const result = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    return { deleted: result.changes > 0, blocked: false };
  } catch (err) {
    if (err.code === 'ERR_SQLITE_ERROR' && /FOREIGN KEY/i.test(err.message)) {
      return { deleted: false, blocked: true };
    }
    throw err;
  }
}

// ---------- users ----------

function getUsers() {
  return db.prepare('SELECT * FROM users ORDER BY criado_em DESC').all().map(toUser);
}

function getUserById(id) {
  return toUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
}

function findUserByEmail(email) {
  return toUser(db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(email || ''));
}

function createUser({ nome, email, senha_hash, role, empresa_id = null, ativo = true }) {
  const user = { id: uuid(), nome, email, senha_hash, role, empresa_id, ativo: ativo ? 1 : 0, criado_em: now() };
  db.prepare(
    'INSERT INTO users (id, nome, email, senha_hash, role, empresa_id, ativo, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(user.id, user.nome, user.email, user.senha_hash, user.role, user.empresa_id, user.ativo, user.criado_em);
  return toUser(user);
}

function updateUser(id, patch) {
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(id)) return null;
  const fields = { ...patch };
  if ('ativo' in fields) fields.ativo = fields.ativo ? 1 : 0;
  updateRow('users', id, fields, { touchUpdatedAt: false });
  return getUserById(id);
}

// ---------- empresas ----------

function getCompanies() {
  return db.prepare('SELECT * FROM empresas ORDER BY criado_em DESC').all();
}

function getCompanyById(id) {
  return db.prepare('SELECT * FROM empresas WHERE id = ?').get(id) || null;
}

function createCompany(company) {
  const row = withDefaults({ id: uuid(), ...company, criado_em: now() });
  db.prepare(
    `INSERT INTO empresas (id, razao_social, nome_fantasia, cnpj, endereco, telefone, email, responsavel, modelo_cobranca, status, criado_em)
     VALUES (@id, @razao_social, @nome_fantasia, @cnpj, @endereco, @telefone, @email, @responsavel, @modelo_cobranca, @status, @criado_em)`
  ).run(row);
  return getCompanyById(row.id);
}

function updateCompany(id, patch) {
  if (!getCompanyById(id)) return null;
  updateRow('empresas', id, patch);
  return getCompanyById(id);
}

function deleteCompany(id) {
  return safeDelete('empresas', id);
}

// ---------- equipamentos ----------

function getEquipments() {
  return db.prepare('SELECT * FROM equipamentos ORDER BY criado_em DESC').all();
}

function getEquipmentById(id) {
  return db.prepare('SELECT * FROM equipamentos WHERE id = ?').get(id) || null;
}

function createEquipment(equipment) {
  const row = withDefaults({ id: uuid(), ...equipment, criado_em: now() });
  db.prepare(
    `INSERT INTO equipamentos (id, empresa_id, modelo, numero_serie, local_instalacao, data_instalacao, garantia_ate, criado_em)
     VALUES (@id, @empresa_id, @modelo, @numero_serie, @local_instalacao, @data_instalacao, @garantia_ate, @criado_em)`
  ).run(row);
  return getEquipmentById(row.id);
}

function updateEquipment(id, patch) {
  if (!getEquipmentById(id)) return null;
  updateRow('equipamentos', id, patch);
  return getEquipmentById(id);
}

function deleteEquipment(id) {
  return safeDelete('equipamentos', id);
}

// ---------- pecas ----------

function getParts() {
  return db.prepare('SELECT * FROM pecas ORDER BY criado_em DESC').all();
}

function getPartById(id) {
  return db.prepare('SELECT * FROM pecas WHERE id = ?').get(id) || null;
}

function createPart(part) {
  const row = withDefaults({ id: uuid(), ...part, criado_em: now() });
  db.prepare(
    `INSERT INTO pecas (id, codigo, nome, categoria, preco_unitario, estoque, fornecedor, criado_em)
     VALUES (@id, @codigo, @nome, @categoria, @preco_unitario, @estoque, @fornecedor, @criado_em)`
  ).run(row);
  return getPartById(row.id);
}

function updatePart(id, patch) {
  if (!getPartById(id)) return null;
  updateRow('pecas', id, patch);
  return getPartById(id);
}

function deletePart(id) {
  return safeDelete('pecas', id);
}

// ---------- regras_cobranca ----------

function getPricingRules() {
  return db.prepare('SELECT * FROM regras_cobranca ORDER BY criado_em DESC').all();
}

function getPricingRuleById(id) {
  return db.prepare('SELECT * FROM regras_cobranca WHERE id = ?').get(id) || null;
}

function createPricingRule(rule) {
  const row = withDefaults({ id: uuid(), ...rule, criado_em: now() });
  db.prepare(
    `INSERT INTO regras_cobranca (id, empresa_id, tipo, valor_base, visitas_incluidas, criado_em)
     VALUES (@id, @empresa_id, @tipo, @valor_base, @visitas_incluidas, @criado_em)`
  ).run(row);
  return getPricingRuleById(row.id);
}

function updatePricingRule(id, patch) {
  if (!getPricingRuleById(id)) return null;
  updateRow('regras_cobranca', id, patch);
  return getPricingRuleById(id);
}

function deletePricingRule(id) {
  return safeDelete('regras_cobranca', id);
}

// ---------- requests ----------

function getRequests() {
  return db.prepare('SELECT * FROM requests ORDER BY criado_em DESC').all();
}

function getRequestById(id) {
  return db.prepare('SELECT * FROM requests WHERE id = ?').get(id) || null;
}

function nextRequestNumber() {
  const max = db.prepare('SELECT MAX(numero) AS n FROM requests').get().n;
  return (max || 0) + 1;
}

function createRequest(request) {
  const row = withDefaults({
    id: uuid(),
    numero: nextRequestNumber(),
    empresa_id: request.empresa_id,
    equipamento_id: request.equipamento_id,
    descricao: request.descricao,
    urgencia: request.urgencia || 'Normal',
    endereco: request.endereco || '',
    status: 'Aberta',
    assigned_technician: null,
    agendado_para: null,
    hora_checkin: null,
    hora_checkout: null,
    relatorio_visita: null,
    avaliacao: null,
    avaliacao_comentario: null,
    aberto_por: request.aberto_por,
    criado_em: now(),
    atualizado_em: now(),
    concluded_at: null
  });
  db.prepare(
    `INSERT INTO requests (id, numero, empresa_id, equipamento_id, descricao, urgencia, endereco, status, assigned_technician, agendado_para, hora_checkin, hora_checkout, relatorio_visita, avaliacao, avaliacao_comentario, aberto_por, criado_em, atualizado_em, concluded_at)
     VALUES (@id, @numero, @empresa_id, @equipamento_id, @descricao, @urgencia, @endereco, @status, @assigned_technician, @agendado_para, @hora_checkin, @hora_checkout, @relatorio_visita, @avaliacao, @avaliacao_comentario, @aberto_por, @criado_em, @atualizado_em, @concluded_at)`
  ).run(row);
  return getRequestById(row.id);
}

function updateRequest(id, patch) {
  const current = getRequestById(id);
  if (!current) return null;
  const fields = { ...patch };
  if (patch.status === 'Concluída' && !current.concluded_at) {
    fields.concluded_at = now();
  }
  updateRow('requests', id, fields);
  return getRequestById(id);
}

// ---------- budgets ----------

function attachItems(budget) {
  if (!budget) return null;
  const items = db.prepare('SELECT * FROM orcamento_itens WHERE orcamento_id = ?').all(budget.id);
  return { ...budget, items };
}

function getBudgets() {
  return db.prepare('SELECT * FROM budgets ORDER BY criado_em DESC').all().map(attachItems);
}

function getBudgetById(id) {
  const budget = db.prepare('SELECT * FROM budgets WHERE id = ?').get(id);
  return budget ? attachItems(budget) : null;
}

function createBudget(budget, items = []) {
  const row = withDefaults({
    id: uuid(),
    request_id: budget.request_id,
    draft_by: budget.draft_by,
    regra_cobranca_id: budget.regra_cobranca_id,
    base_total: budget.base_total || 0,
    pecas_total: budget.pecas_total || 0,
    mao_obra_total: budget.mao_obra_total || 0,
    total: budget.total,
    status: 'Rascunho',
    deslocamento: budget.deslocamento || 0,
    urgencia: budget.urgencia || 0,
    horas_trabalho: budget.horas_trabalho || 0,
    criado_em: now(),
    atualizado_em: now()
  });
  db.prepare(
    `INSERT INTO budgets (id, request_id, draft_by, regra_cobranca_id, base_total, pecas_total, mao_obra_total, total, status, deslocamento, urgencia, horas_trabalho, criado_em, atualizado_em)
     VALUES (@id, @request_id, @draft_by, @regra_cobranca_id, @base_total, @pecas_total, @mao_obra_total, @total, @status, @deslocamento, @urgencia, @horas_trabalho, @criado_em, @atualizado_em)`
  ).run(row);

  const insertItem = db.prepare(
    'INSERT INTO orcamento_itens (id, orcamento_id, peca_id, valor_unitario, quantidade) VALUES (?, ?, ?, ?, ?)'
  );
  items.forEach((item) => {
    insertItem.run(uuid(), row.id, item.peca_id ?? null, item.valor_unitario, item.quantidade);
  });

  return getBudgetById(row.id);
}

function updateBudget(id, patch) {
  if (!db.prepare('SELECT id FROM budgets WHERE id = ?').get(id)) return null;
  updateRow('budgets', id, patch);
  return getBudgetById(id);
}

// ---------- contratos ----------

function getContracts() {
  return db.prepare('SELECT * FROM contratos ORDER BY criado_em DESC').all();
}

function getContractById(id) {
  return db.prepare('SELECT * FROM contratos WHERE id = ?').get(id) || null;
}

function getContractByBudgetId(orcamento_id) {
  return db.prepare('SELECT * FROM contratos WHERE orcamento_id = ?').get(orcamento_id) || null;
}

function nextContractNumber() {
  const year = new Date().getFullYear();
  const count = db.prepare("SELECT COUNT(*) AS n FROM contratos WHERE numero LIKE ?").get(`CT-${year}-%`).n;
  return `CT-${year}-${String(count + 1).padStart(4, '0')}`;
}

function createContractForBudget(budget) {
  const existing = getContractByBudgetId(budget.id);
  if (existing) return existing;

  const request = getRequestById(budget.request_id);
  const row = {
    id: uuid(),
    numero: nextContractNumber(),
    orcamento_id: budget.id,
    empresa_id: request.empresa_id,
    request_id: request.id,
    valor_total: budget.total,
    status: 'Ativo',
    criado_em: now()
  };
  db.prepare(
    `INSERT INTO contratos (id, numero, orcamento_id, empresa_id, request_id, valor_total, status, criado_em)
     VALUES (@id, @numero, @orcamento_id, @empresa_id, @request_id, @valor_total, @status, @criado_em)`
  ).run(row);
  return getContractById(row.id);
}

// ---------- notificacoes ----------

function getNotifications(empresa_id) {
  return db.prepare('SELECT * FROM notificacoes WHERE empresa_id = ? ORDER BY criado_em DESC LIMIT 50').all(empresa_id).map((n) => ({ ...n, lida: !!n.lida }));
}

function createNotification({ empresa_id, titulo, mensagem, link }) {
  if (!empresa_id) return null;
  const row = withDefaults({
    id: uuid(),
    empresa_id,
    titulo,
    mensagem: mensagem || null,
    link: link || null,
    lida: 0,
    criado_em: now()
  });
  db.prepare(
    `INSERT INTO notificacoes (id, empresa_id, titulo, mensagem, link, lida, criado_em)
     VALUES (@id, @empresa_id, @titulo, @mensagem, @link, @lida, @criado_em)`
  ).run(row);
  return row;
}

function markNotificationsRead(empresa_id) {
  db.prepare('UPDATE notificacoes SET lida = 1 WHERE empresa_id = ?').run(empresa_id);
}

module.exports = {
  getUsers,
  getUserById,
  findUserByEmail,
  createUser,
  updateUser,
  getCompanies,
  getCompanyById,
  createCompany,
  updateCompany,
  deleteCompany,
  getEquipments,
  getEquipmentById,
  createEquipment,
  updateEquipment,
  deleteEquipment,
  getParts,
  getPartById,
  createPart,
  updatePart,
  deletePart,
  getPricingRules,
  getPricingRuleById,
  createPricingRule,
  updatePricingRule,
  deletePricingRule,
  getRequests,
  getRequestById,
  createRequest,
  updateRequest,
  getBudgets,
  getBudgetById,
  createBudget,
  updateBudget,
  getContracts,
  getContractById,
  getContractByBudgetId,
  createContractForBudget,
  getNotifications,
  createNotification,
  markNotificationsRead
};
