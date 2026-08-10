const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : undefined
});

const SCHEMA_SQL = `
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

  CREATE TABLE IF NOT EXISTS unidades (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL REFERENCES empresas(id),
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'Filial',
    endereco TEXT,
    telefone TEXT,
    responsavel TEXT,
    criado_em TEXT NOT NULL,
    atualizado_em TEXT
  );

  ALTER TABLE unidades ADD COLUMN IF NOT EXISTS codigo TEXT;
  ALTER TABLE unidades ADD COLUMN IF NOT EXISTS cnpj TEXT;
  ALTER TABLE unidades ADD COLUMN IF NOT EXISTS cep TEXT;
  ALTER TABLE unidades ADD COLUMN IF NOT EXISTS numero TEXT;
  ALTER TABLE unidades ADD COLUMN IF NOT EXISTS complemento TEXT;
  ALTER TABLE unidades ADD COLUMN IF NOT EXISTS bairro TEXT;
  ALTER TABLE unidades ADD COLUMN IF NOT EXISTS cidade TEXT;
  ALTER TABLE unidades ADD COLUMN IF NOT EXISTS estado TEXT;
  ALTER TABLE unidades ADD COLUMN IF NOT EXISTS email TEXT;
  ALTER TABLE unidades ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ativo';
  ALTER TABLE unidades ADD COLUMN IF NOT EXISTS valor_deslocamento_padrao REAL;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_unidades_sede_unica ON unidades(empresa_id) WHERE tipo = 'Sede';

  ALTER TABLE users ADD COLUMN IF NOT EXISTS unidade_id TEXT REFERENCES unidades(id);
  ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;

  ALTER TABLE empresas ADD COLUMN IF NOT EXISTS inscricao_estadual TEXT;
  ALTER TABLE empresas ALTER COLUMN endereco DROP NOT NULL;

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

  ALTER TABLE equipamentos ADD COLUMN IF NOT EXISTS unidade_id TEXT REFERENCES unidades(id);

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

  ALTER TABLE budgets ALTER COLUMN regra_cobranca_id DROP NOT NULL;
  ALTER TABLE budgets ADD COLUMN IF NOT EXISTS empresa_id TEXT REFERENCES empresas(id);
  ALTER TABLE budgets ADD COLUMN IF NOT EXISTS unidade_id TEXT REFERENCES unidades(id);

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

  CREATE TABLE IF NOT EXISTS milvus_chamados_pendentes (
    id TEXT PRIMARY KEY,
    milvus_codigo TEXT NOT NULL UNIQUE,
    milvus_id TEXT,
    assunto TEXT,
    descricao TEXT,
    cliente_nome TEXT,
    cliente_email TEXT,
    cliente_telefone TEXT,
    cliente_contato TEXT,
    status TEXT NOT NULL DEFAULT 'pendente',
    request_id TEXT REFERENCES requests(id),
    raw_json TEXT,
    criado_em TEXT NOT NULL,
    atualizado_em TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_milvus_pendentes_status ON milvus_chamados_pendentes(status);

  CREATE TABLE IF NOT EXISTS visita_aceites (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL UNIQUE REFERENCES requests(id),
    contrato_id TEXT REFERENCES contratos(id),
    nome_aceitante TEXT NOT NULL,
    documento_aceitante TEXT,
    cargo_aceitante TEXT,
    email_aceitante TEXT,
    telefone_aceitante TEXT,
    ip TEXT,
    user_agent TEXT,
    hash_documento TEXT NOT NULL,
    codigo_validacao TEXT NOT NULL UNIQUE,
    versao_termo TEXT NOT NULL,
    snapshot TEXT NOT NULL,
    criado_em TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_visita_aceites_codigo ON visita_aceites(codigo_validacao);

  CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    user_nome TEXT,
    acao TEXT NOT NULL,
    entidade TEXT NOT NULL,
    entidade_id TEXT,
    detalhes TEXT,
    criado_em TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_audit_log_criado_em ON audit_log(criado_em DESC);
  CREATE INDEX IF NOT EXISTS idx_unidades_empresa ON unidades(empresa_id);
  CREATE INDEX IF NOT EXISTS idx_equipamentos_empresa ON equipamentos(empresa_id);
  CREATE INDEX IF NOT EXISTS idx_requests_empresa ON requests(empresa_id);
  CREATE INDEX IF NOT EXISTS idx_budgets_request ON budgets(request_id);
  CREATE INDEX IF NOT EXISTS idx_itens_orcamento ON orcamento_itens(orcamento_id);
  CREATE INDEX IF NOT EXISTS idx_contratos_empresa ON contratos(empresa_id);
  CREATE INDEX IF NOT EXISTS idx_notificacoes_empresa ON notificacoes(empresa_id);
`;

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

async function seedDefaultAdmin() {
  const { rows } = await pool.query('SELECT COUNT(*) AS n FROM users');
  const count = Number(rows[0].n);
  if (count > 0) return;
  const email = process.env.ADMIN_EMAIL || 'admin@empresa.com';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  if (!process.env.ADMIN_PASSWORD) {
    console.warn('[aviso] ADMIN_PASSWORD não definido — usando senha padrão insegura "admin123". Configure ADMIN_PASSWORD antes de ir para produção.');
  }
  await pool.query(
    'INSERT INTO users (id, nome, email, senha_hash, role, empresa_id, ativo, criado_em) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
    [uuid(), 'Administrador', email, bcrypt.hashSync(password, 10), 'gestor', null, 1, now()]
  );
}

async function initDb() {
  await pool.query(SCHEMA_SQL);
  await seedDefaultAdmin();
}

// ---------- generic partial-update helper ----------

async function updateRow(table, id, patch, { touchUpdatedAt = true } = {}) {
  const fields = { ...patch };
  if (touchUpdatedAt) fields.atualizado_em = now();

  const keys = Object.keys(fields);
  if (keys.length === 0) return;

  const setClause = keys.map((key, idx) => `${key} = $${idx + 1}`).join(', ');
  const values = keys.map((key) => (fields[key] === undefined ? null : fields[key]));
  values.push(id);
  await pool.query(`UPDATE ${table} SET ${setClause} WHERE id = $${keys.length + 1}`, values);
}

async function safeDelete(table, id) {
  try {
    const result = await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    return { deleted: result.rowCount > 0, blocked: false };
  } catch (err) {
    if (err.code === '23503') {
      return { deleted: false, blocked: true };
    }
    throw err;
  }
}

// ---------- users ----------

async function getUsers() {
  const { rows } = await pool.query('SELECT * FROM users ORDER BY criado_em DESC');
  return rows.map(toUser);
}

async function getUserById(id) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return toUser(rows[0] || null);
}

async function findUserByEmail(email) {
  const { rows } = await pool.query('SELECT * FROM users WHERE lower(email) = lower($1)', [email || '']);
  return toUser(rows[0] || null);
}

async function createUser({ nome, email, senha_hash, role, empresa_id = null, unidade_id = null, ativo = true }) {
  const user = { id: uuid(), nome, email, senha_hash, role, empresa_id, unidade_id, ativo: ativo ? 1 : 0, criado_em: now() };
  await pool.query(
    'INSERT INTO users (id, nome, email, senha_hash, role, empresa_id, unidade_id, ativo, criado_em) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    [user.id, user.nome, user.email, user.senha_hash, user.role, user.empresa_id, user.unidade_id, user.ativo, user.criado_em]
  );
  return toUser(user);
}

async function updateUser(id, patch) {
  const { rows } = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
  if (!rows[0]) return null;
  const fields = { ...patch };
  if ('ativo' in fields) fields.ativo = fields.ativo ? 1 : 0;
  await updateRow('users', id, fields, { touchUpdatedAt: false });
  return getUserById(id);
}

// ---------- empresas ----------

async function getCompanies() {
  const { rows } = await pool.query('SELECT * FROM empresas ORDER BY criado_em DESC');
  return rows;
}

async function getCompanyById(id) {
  const { rows } = await pool.query('SELECT * FROM empresas WHERE id = $1', [id]);
  return rows[0] || null;
}

async function createCompany(company) {
  const row = withDefaults({ id: uuid(), ...company, criado_em: now() });
  await pool.query(
    `INSERT INTO empresas (id, razao_social, nome_fantasia, cnpj, inscricao_estadual, endereco, telefone, email, responsavel, modelo_cobranca, status, criado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [row.id, row.razao_social, row.nome_fantasia, row.cnpj, row.inscricao_estadual, row.endereco, row.telefone, row.email, row.responsavel, row.modelo_cobranca, row.status, row.criado_em]
  );
  return getCompanyById(row.id);
}

async function updateCompany(id, patch) {
  const existing = await getCompanyById(id);
  if (!existing) return null;
  await updateRow('empresas', id, patch);
  return getCompanyById(id);
}

async function deleteCompany(id) {
  return safeDelete('empresas', id);
}

// ---------- unidades ----------

async function getUnits(empresa_id) {
  if (empresa_id) {
    const { rows } = await pool.query('SELECT * FROM unidades WHERE empresa_id = $1 ORDER BY criado_em DESC', [empresa_id]);
    return rows;
  }
  const { rows } = await pool.query('SELECT * FROM unidades ORDER BY criado_em DESC');
  return rows;
}

async function getUnitById(id) {
  const { rows } = await pool.query('SELECT * FROM unidades WHERE id = $1', [id]);
  return rows[0] || null;
}

async function createUnit(unit) {
  const row = withDefaults({
    id: uuid(),
    ...unit,
    status: unit.status || 'ativo',
    criado_em: now()
  });
  await pool.query(
    `INSERT INTO unidades (id, empresa_id, nome, tipo, codigo, cnpj, cep, endereco, numero, complemento, bairro, cidade, estado, responsavel, telefone, email, status, valor_deslocamento_padrao, criado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
    [row.id, row.empresa_id, row.nome, row.tipo, row.codigo, row.cnpj, row.cep, row.endereco, row.numero, row.complemento, row.bairro, row.cidade, row.estado, row.responsavel, row.telefone, row.email, row.status, row.valor_deslocamento_padrao ?? null, row.criado_em]
  );
  return getUnitById(row.id);
}

async function updateUnit(id, patch) {
  const existing = await getUnitById(id);
  if (!existing) return null;
  await updateRow('unidades', id, patch);
  return getUnitById(id);
}

async function deleteUnit(id) {
  return safeDelete('unidades', id);
}

// ---------- equipamentos ----------

async function getEquipments() {
  const { rows } = await pool.query('SELECT * FROM equipamentos ORDER BY criado_em DESC');
  return rows;
}

async function getEquipmentById(id) {
  const { rows } = await pool.query('SELECT * FROM equipamentos WHERE id = $1', [id]);
  return rows[0] || null;
}

async function createEquipment(equipment) {
  const row = withDefaults({ id: uuid(), ...equipment, criado_em: now() });
  await pool.query(
    `INSERT INTO equipamentos (id, empresa_id, unidade_id, modelo, numero_serie, local_instalacao, data_instalacao, garantia_ate, criado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [row.id, row.empresa_id, row.unidade_id, row.modelo, row.numero_serie, row.local_instalacao, row.data_instalacao, row.garantia_ate, row.criado_em]
  );
  return getEquipmentById(row.id);
}

async function updateEquipment(id, patch) {
  const existing = await getEquipmentById(id);
  if (!existing) return null;
  await updateRow('equipamentos', id, patch);
  return getEquipmentById(id);
}

async function deleteEquipment(id) {
  return safeDelete('equipamentos', id);
}

// ---------- pecas ----------

async function getParts() {
  const { rows } = await pool.query('SELECT * FROM pecas ORDER BY criado_em DESC');
  return rows;
}

async function getPartById(id) {
  const { rows } = await pool.query('SELECT * FROM pecas WHERE id = $1', [id]);
  return rows[0] || null;
}

async function createPart(part) {
  const row = withDefaults({ id: uuid(), ...part, criado_em: now() });
  await pool.query(
    `INSERT INTO pecas (id, codigo, nome, categoria, preco_unitario, estoque, fornecedor, criado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [row.id, row.codigo, row.nome, row.categoria, row.preco_unitario, row.estoque, row.fornecedor, row.criado_em]
  );
  return getPartById(row.id);
}

async function updatePart(id, patch) {
  const existing = await getPartById(id);
  if (!existing) return null;
  await updateRow('pecas', id, patch);
  return getPartById(id);
}

async function deletePart(id) {
  return safeDelete('pecas', id);
}

// ---------- regras_cobranca ----------

async function getPricingRules() {
  const { rows } = await pool.query('SELECT * FROM regras_cobranca ORDER BY criado_em DESC');
  return rows;
}

async function getPricingRuleById(id) {
  const { rows } = await pool.query('SELECT * FROM regras_cobranca WHERE id = $1', [id]);
  return rows[0] || null;
}

async function createPricingRule(rule) {
  const row = withDefaults({ id: uuid(), ...rule, criado_em: now() });
  await pool.query(
    `INSERT INTO regras_cobranca (id, empresa_id, tipo, valor_base, visitas_incluidas, criado_em)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [row.id, row.empresa_id, row.tipo, row.valor_base, row.visitas_incluidas, row.criado_em]
  );
  return getPricingRuleById(row.id);
}

async function updatePricingRule(id, patch) {
  const existing = await getPricingRuleById(id);
  if (!existing) return null;
  await updateRow('regras_cobranca', id, patch);
  return getPricingRuleById(id);
}

async function deletePricingRule(id) {
  return safeDelete('regras_cobranca', id);
}

// ---------- requests ----------

async function getRequests() {
  const { rows } = await pool.query('SELECT * FROM requests ORDER BY criado_em DESC');
  return rows;
}

async function getRequestById(id) {
  const { rows } = await pool.query('SELECT * FROM requests WHERE id = $1', [id]);
  return rows[0] || null;
}

async function nextRequestNumber() {
  const { rows } = await pool.query('SELECT MAX(numero) AS n FROM requests');
  return (rows[0].n || 0) + 1;
}

async function createRequest(request) {
  const row = withDefaults({
    id: uuid(),
    numero: await nextRequestNumber(),
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
  await pool.query(
    `INSERT INTO requests (id, numero, empresa_id, equipamento_id, descricao, urgencia, endereco, status, assigned_technician, agendado_para, hora_checkin, hora_checkout, relatorio_visita, avaliacao, avaliacao_comentario, aberto_por, criado_em, atualizado_em, concluded_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
    [row.id, row.numero, row.empresa_id, row.equipamento_id, row.descricao, row.urgencia, row.endereco, row.status, row.assigned_technician, row.agendado_para, row.hora_checkin, row.hora_checkout, row.relatorio_visita, row.avaliacao, row.avaliacao_comentario, row.aberto_por, row.criado_em, row.atualizado_em, row.concluded_at]
  );
  return getRequestById(row.id);
}

async function updateRequest(id, patch) {
  const current = await getRequestById(id);
  if (!current) return null;
  const fields = { ...patch };
  if (patch.status === 'Concluída' && !current.concluded_at) {
    fields.concluded_at = now();
  }
  await updateRow('requests', id, fields);
  return getRequestById(id);
}

async function deleteRequest(id) {
  return safeDelete('requests', id);
}

// ---------- budgets ----------

async function attachItems(budget) {
  if (!budget) return null;
  const { rows } = await pool.query('SELECT * FROM orcamento_itens WHERE orcamento_id = $1', [budget.id]);
  return { ...budget, items: rows };
}

async function getBudgets() {
  const { rows } = await pool.query('SELECT * FROM budgets ORDER BY criado_em DESC');
  return Promise.all(rows.map(attachItems));
}

async function getBudgetById(id) {
  const { rows } = await pool.query('SELECT * FROM budgets WHERE id = $1', [id]);
  return rows[0] ? attachItems(rows[0]) : null;
}

async function createBudget(budget, items = []) {
  const row = withDefaults({
    id: uuid(),
    request_id: budget.request_id,
    draft_by: budget.draft_by,
    regra_cobranca_id: budget.regra_cobranca_id,
    empresa_id: budget.empresa_id,
    unidade_id: budget.unidade_id,
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
  await pool.query(
    `INSERT INTO budgets (id, request_id, draft_by, regra_cobranca_id, empresa_id, unidade_id, base_total, pecas_total, mao_obra_total, total, status, deslocamento, urgencia, horas_trabalho, criado_em, atualizado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [row.id, row.request_id, row.draft_by, row.regra_cobranca_id, row.empresa_id, row.unidade_id, row.base_total, row.pecas_total, row.mao_obra_total, row.total, row.status, row.deslocamento, row.urgencia, row.horas_trabalho, row.criado_em, row.atualizado_em]
  );

  for (const item of items) {
    await pool.query(
      'INSERT INTO orcamento_itens (id, orcamento_id, peca_id, valor_unitario, quantidade) VALUES ($1, $2, $3, $4, $5)',
      [uuid(), row.id, item.peca_id ?? null, item.valor_unitario, item.quantidade]
    );
  }

  return getBudgetById(row.id);
}

async function updateBudget(id, patch) {
  const { rows } = await pool.query('SELECT id FROM budgets WHERE id = $1', [id]);
  if (!rows[0]) return null;
  await updateRow('budgets', id, patch);
  return getBudgetById(id);
}

// ---------- contratos ----------

async function getContracts() {
  const { rows } = await pool.query('SELECT * FROM contratos ORDER BY criado_em DESC');
  return rows;
}

async function getContractById(id) {
  const { rows } = await pool.query('SELECT * FROM contratos WHERE id = $1', [id]);
  return rows[0] || null;
}

async function getContractByBudgetId(orcamento_id) {
  const { rows } = await pool.query('SELECT * FROM contratos WHERE orcamento_id = $1', [orcamento_id]);
  return rows[0] || null;
}

async function nextContractNumber() {
  const year = new Date().getFullYear();
  const { rows } = await pool.query('SELECT COUNT(*) AS n FROM contratos WHERE numero LIKE $1', [`CT-${year}-%`]);
  const count = Number(rows[0].n);
  return `CT-${year}-${String(count + 1).padStart(4, '0')}`;
}

async function createContractForBudget(budget) {
  const existing = await getContractByBudgetId(budget.id);
  if (existing) return existing;

  const request = await getRequestById(budget.request_id);
  const row = {
    id: uuid(),
    numero: await nextContractNumber(),
    orcamento_id: budget.id,
    empresa_id: request.empresa_id,
    request_id: request.id,
    valor_total: budget.total,
    status: 'Ativo',
    criado_em: now()
  };
  await pool.query(
    `INSERT INTO contratos (id, numero, orcamento_id, empresa_id, request_id, valor_total, status, criado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [row.id, row.numero, row.orcamento_id, row.empresa_id, row.request_id, row.valor_total, row.status, row.criado_em]
  );
  return getContractById(row.id);
}

// ---------- notificacoes ----------

async function getNotifications(empresa_id) {
  const { rows } = await pool.query('SELECT * FROM notificacoes WHERE empresa_id = $1 ORDER BY criado_em DESC LIMIT 50', [empresa_id]);
  return rows.map((n) => ({ ...n, lida: !!n.lida }));
}

async function createNotification({ empresa_id, titulo, mensagem, link }) {
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
  await pool.query(
    `INSERT INTO notificacoes (id, empresa_id, titulo, mensagem, link, lida, criado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [row.id, row.empresa_id, row.titulo, row.mensagem, row.link, row.lida, row.criado_em]
  );
  return row;
}

async function markNotificationsRead(empresa_id) {
  await pool.query('UPDATE notificacoes SET lida = 1 WHERE empresa_id = $1', [empresa_id]);
}

// ---------- integração Milvus ----------

async function getMilvusPendentesByCodigos(codigos) {
  if (!codigos.length) return [];
  const { rows } = await pool.query('SELECT milvus_codigo FROM milvus_chamados_pendentes WHERE milvus_codigo = ANY($1)', [codigos]);
  return rows.map((r) => r.milvus_codigo);
}

async function createMilvusPendente(data) {
  const row = {
    id: uuid(),
    ...data,
    status: 'pendente',
    criado_em: now()
  };
  await pool.query(
    `INSERT INTO milvus_chamados_pendentes (id, milvus_codigo, milvus_id, assunto, descricao, cliente_nome, cliente_email, cliente_telefone, cliente_contato, status, raw_json, criado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [row.id, row.milvus_codigo, row.milvus_id || null, row.assunto || null, row.descricao || null, row.cliente_nome || null, row.cliente_email || null, row.cliente_telefone || null, row.cliente_contato || null, row.status, row.raw_json, row.criado_em]
  );
  return row;
}

async function getMilvusPendentes(status) {
  const { rows } = status
    ? await pool.query('SELECT * FROM milvus_chamados_pendentes WHERE status = $1 ORDER BY criado_em DESC', [status])
    : await pool.query('SELECT * FROM milvus_chamados_pendentes ORDER BY criado_em DESC');
  return rows;
}

async function getMilvusPendenteById(id) {
  const { rows } = await pool.query('SELECT * FROM milvus_chamados_pendentes WHERE id = $1', [id]);
  return rows[0] || null;
}

async function updateMilvusPendente(id, patch) {
  await updateRow('milvus_chamados_pendentes', id, patch);
  return getMilvusPendenteById(id);
}

// ---------- termo de conclusão / aceite de visita ----------

async function getVisitaAceiteByRequestId(request_id) {
  const { rows } = await pool.query('SELECT * FROM visita_aceites WHERE request_id = $1', [request_id]);
  return rows[0] || null;
}

async function getVisitaAceiteByCodigo(codigo) {
  const { rows } = await pool.query('SELECT * FROM visita_aceites WHERE codigo_validacao = $1', [codigo]);
  return rows[0] || null;
}

async function createVisitaAceite(data) {
  const row = {
    id: uuid(),
    ...data,
    criado_em: now()
  };
  await pool.query(
    `INSERT INTO visita_aceites (id, request_id, contrato_id, nome_aceitante, documento_aceitante, cargo_aceitante, email_aceitante, telefone_aceitante, ip, user_agent, hash_documento, codigo_validacao, versao_termo, snapshot, criado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [row.id, row.request_id, row.contrato_id || null, row.nome_aceitante, row.documento_aceitante || null, row.cargo_aceitante || null, row.email_aceitante || null, row.telefone_aceitante || null, row.ip || null, row.user_agent || null, row.hash_documento, row.codigo_validacao, row.versao_termo, row.snapshot, row.criado_em]
  );
  return row;
}

// ---------- audit log ----------

async function logAudit({ user, acao, entidade, entidade_id, detalhes }) {
  try {
    const row = {
      id: uuid(),
      user_id: user?.sub || user?.id || null,
      user_nome: user?.nome || user?.name || null,
      acao,
      entidade,
      entidade_id: entidade_id || null,
      detalhes: detalhes || null,
      criado_em: now()
    };
    await pool.query(
      `INSERT INTO audit_log (id, user_id, user_nome, acao, entidade, entidade_id, detalhes, criado_em)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [row.id, row.user_id, row.user_nome, row.acao, row.entidade, row.entidade_id, row.detalhes, row.criado_em]
    );
  } catch (err) {
    console.error('[audit] Falha ao registrar log:', err.message);
  }
}

async function getAuditLog({ page = 1, pageSize = 50 } = {}) {
  const offset = (page - 1) * pageSize;
  const { rows } = await pool.query(
    'SELECT * FROM audit_log ORDER BY criado_em DESC LIMIT $1 OFFSET $2',
    [pageSize, offset]
  );
  const { rows: countRows } = await pool.query('SELECT COUNT(*) FROM audit_log');
  return { items: rows, total: Number(countRows[0].count) };
}

module.exports = {
  initDb,
  getUsers,
  getUserById,
  findUserByEmail,
  createUser,
  updateUser,
  getCompanies,
  getCompanyById,
  createCompany,
  getUnits,
  getUnitById,
  createUnit,
  updateUnit,
  deleteUnit,
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
  deleteRequest,
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
  markNotificationsRead,
  logAudit,
  getAuditLog,
  getVisitaAceiteByRequestId,
  getVisitaAceiteByCodigo,
  createVisitaAceite,
  getMilvusPendentesByCodigos,
  createMilvusPendente,
  getMilvusPendentes,
  getMilvusPendenteById,
  updateMilvusPendente
};
