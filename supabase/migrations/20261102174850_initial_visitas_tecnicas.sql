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
  ALTER TABLE users ADD COLUMN IF NOT EXISTS liberado_para_chamado INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS milvus_email TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS milvus_nome TEXT;
  CREATE TABLE IF NOT EXISTS technician_availability (
    technician_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    available_on DATE NOT NULL,
    available_until TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (technician_id, available_on)
  );
  UPDATE users SET milvus_email = lower(email)
  WHERE milvus_email IS NULL AND role IN ('tecnico', 'analista');
  UPDATE users SET milvus_nome = nome
  WHERE milvus_nome IS NULL AND role IN ('tecnico', 'analista');
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_milvus_email
  ON users(lower(milvus_email)) WHERE milvus_email IS NOT NULL;

  ALTER TABLE empresas ADD COLUMN IF NOT EXISTS inscricao_estadual TEXT;
  ALTER TABLE empresas ALTER COLUMN endereco DROP NOT NULL;
  ALTER TABLE empresas ADD COLUMN IF NOT EXISTS milvus_cliente_token TEXT;

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

  ALTER TABLE pecas ADD COLUMN IF NOT EXISTS bomcontrole_id BIGINT;
  ALTER TABLE pecas ADD COLUMN IF NOT EXISTS sincronizado_em TEXT;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_pecas_bomcontrole_id ON pecas(bomcontrole_id) WHERE bomcontrole_id IS NOT NULL;

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

  ALTER TABLE requests ADD COLUMN IF NOT EXISTS milvus_codigo TEXT;
  ALTER TABLE requests ADD COLUMN IF NOT EXISTS milvus_id TEXT;
  ALTER TABLE requests ADD COLUMN IF NOT EXISTS aprovacao_cliente TEXT;
  ALTER TABLE requests ADD COLUMN IF NOT EXISTS data_aprovacao_cliente TEXT;
  ALTER TABLE requests ADD COLUMN IF NOT EXISTS solicitante_email TEXT;
  ALTER TABLE requests ADD COLUMN IF NOT EXISTS aprovacao_nome TEXT;
  ALTER TABLE requests ADD COLUMN IF NOT EXISTS aprovacao_cpf TEXT;
  ALTER TABLE requests ADD COLUMN IF NOT EXISTS aprovacao_telefone TEXT;
  ALTER TABLE requests ADD COLUMN IF NOT EXISTS teve_adicional BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE requests ADD COLUMN IF NOT EXISTS adicional_descricao TEXT;
  ALTER TABLE requests ADD COLUMN IF NOT EXISTS custo_adicional REAL NOT NULL DEFAULT 0;
  ALTER TABLE requests ADD COLUMN IF NOT EXISTS observacao_final TEXT;
  ALTER TABLE requests ADD COLUMN IF NOT EXISTS assigned_analyst TEXT;
  UPDATE requests AS r SET assigned_analyst = r.aberto_por
  FROM users AS u
  WHERE r.assigned_analyst IS NULL AND r.aberto_por = u.id AND u.role = 'analista';
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
  ALTER TABLE budgets ADD COLUMN IF NOT EXISTS motivo_troca TEXT;
  ALTER TABLE budgets ADD COLUMN IF NOT EXISTS servico_realizado TEXT;
  ALTER TABLE budgets ADD COLUMN IF NOT EXISTS observacoes_tecnicas TEXT;
  ALTER TABLE budgets ADD COLUMN IF NOT EXISTS aprovado_em TEXT;
  ALTER TABLE budgets ADD COLUMN IF NOT EXISTS autorizado_por TEXT;
  ALTER TABLE budgets ADD COLUMN IF NOT EXISTS milvus_codigo TEXT;
  ALTER TABLE budgets ADD COLUMN IF NOT EXISTS aprovacao_nome TEXT;
  ALTER TABLE budgets ADD COLUMN IF NOT EXISTS aprovacao_cpf TEXT;
  ALTER TABLE budgets ADD COLUMN IF NOT EXISTS aprovacao_telefone TEXT;

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

  ALTER TABLE milvus_chamados_pendentes ADD COLUMN IF NOT EXISTS auto_observacao TEXT;

  CREATE INDEX IF NOT EXISTS idx_milvus_pendentes_status ON milvus_chamados_pendentes(status);

  UPDATE requests AS r
  SET milvus_codigo = m.milvus_codigo
  FROM milvus_chamados_pendentes AS m
  WHERE m.request_id = r.id AND r.milvus_codigo IS NULL;

  UPDATE requests AS r
  SET milvus_id = m.milvus_id
  FROM milvus_chamados_pendentes AS m
  WHERE m.request_id = r.id AND r.milvus_id IS NULL AND m.milvus_id IS NOT NULL;

  UPDATE budgets AS b
  SET milvus_codigo = r.milvus_codigo
  FROM requests AS r
  WHERE b.request_id = r.id AND b.milvus_codigo IS NULL AND r.milvus_codigo IS NOT NULL;

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

-- Estas tabelas são acessadas pela API Node via conexão PostgreSQL do backend.
-- RLS fica ativo e os papéis da Data API não recebem acesso direto.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.users FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.empresas FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.unidades FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.technician_availability ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.technician_availability FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.equipamentos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.equipamentos FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.pecas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pecas FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.regras_cobranca ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.regras_cobranca FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.requests FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.budgets FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.orcamento_itens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.orcamento_itens FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.contratos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.contratos FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notificacoes FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.milvus_chamados_pendentes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.milvus_chamados_pendentes FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.visita_aceites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.visita_aceites FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.audit_log FROM PUBLIC, anon, authenticated, service_role;
