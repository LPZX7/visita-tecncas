const crypto = require('crypto');
const db = require('./db');
const {
  listarChamadosVisitaTecnica,
  listarClientes,
  buscarClientePorDocumento,
  criarChamado,
  atualizarResponsavelChamado,
  criarAcompanhamento,
  finalizarChamado
} = require('./milvus');
const { buildMilvusPayload } = require('./visitaTecnicaFormat');
const { buildCompletionSummary } = require('./visitCompletion');
const { isValidEmail, normalizeEmail } = require('./contact');
const { normalizeText } = require('./milvusDraft');
const { autoImportMilvusPendentes } = require('./milvusImportService');

function milvusError(message, statusCode = 502) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.expose = true;
  return error;
}

async function syncMilvusChamados() {
  const lista = await listarChamadosVisitaTecnica();
  const codigos = lista.map((t) => String(t.codigo));
  const existentes = new Set(await db.getMilvusPendentesByCodigos(codigos));

  let novos = 0;
  for (const ticket of lista) {
    const codigo = String(ticket.codigo);
    if (existentes.has(codigo)) continue;

    await db.createMilvusPendente({
      milvus_codigo: codigo,
      milvus_id: ticket.id ? String(ticket.id) : null,
      assunto: ticket.assunto || null,
      descricao: ticket.descricao || ticket.descricao_html || null,
      cliente_nome: ticket.cliente || ticket.contato || null,
      cliente_email: ticket.email_conferencia || null,
      cliente_telefone: ticket.telefone || null,
      cliente_contato: ticket.contato || null,
      raw_json: JSON.stringify(ticket)
    });
    novos++;
  }

  let automatico = { importados: 0, aguardando_revisao: 0, request_ids: [] };
  try {
    automatico = await autoImportMilvusPendentes();
  } catch (error) {
    console.error('[milvus-auto] Falha ao processar a fila automática:', error.message);
  }

  return {
    encontrados: lista.length,
    novos,
    importados_automaticamente: automatico.importados,
    aguardando_revisao: automatico.aguardando_revisao,
    chamados_importados: automatico.request_ids
  };
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function clientAddress(client) {
  const direct = firstText(client.endereco, client.endereco_completo, client.address);
  if (direct) return direct;

  const addresses = client.cliente_enderecos || client.enderecos || client.addresses || [];
  const address = Array.isArray(addresses)
    ? (addresses.find((item) => item.endereco_padrao === true || item.is_padrao === true) || addresses[0])
    : addresses;
  if (!address || typeof address !== 'object') return null;

  return [
    firstText(address.endereco_logradouro, address.logradouro, address.rua),
    firstText(address.endereco_numero, address.numero),
    firstText(address.endereco_complemento, address.complemento),
    firstText(address.endereco_bairro, address.bairro),
    firstText(address.endereco_cidade, address.cidade),
    firstText(address.endereco_estado, address.estado),
    firstText(address.endereco_cep, address.cep)
  ].filter(Boolean).join(', ') || null;
}

function normalizeMilvusClient(client) {
  const pessoaJuridica = client.cliente_pessoa_juridica || client.pessoa_juridica || {};
  const pessoaFisica = client.cliente_pessoa_fisica || client.pessoa_fisica || {};
  const contacts = client.cliente_contatos || client.contatos || client.contacts || [];
  const contact = Array.isArray(contacts)
    ? (contacts.find((item) => item.contato_padrao === true || item.is_padrao === true) || contacts[0] || {})
    : contacts;
  const document = firstText(client.cnpj_cpf, client.cliente_documento, client.documento, client.cnpj);
  const statusValue = client.is_ativo ?? client.cliente_ativo ?? client.ativo;
  const inactive = statusValue === false || statusValue === 0 || ['false', '0', 'inativo', 'bloqueado'].includes(String(statusValue || '').trim().toLowerCase());
  const razaoSocial = firstText(
    client.razao_social,
    pessoaJuridica.razao_social,
    client.nome,
    pessoaFisica.nome,
    client.nome_fantasia,
    pessoaJuridica.nome_fantasia
  );

  return {
    razao_social: razaoSocial,
    nome_fantasia: firstText(client.nome_fantasia, pessoaJuridica.nome_fantasia, razaoSocial),
    cnpj: digitsOnly(document),
    inscricao_estadual: firstText(client.inscricao_estadual, pessoaJuridica.inscricao_estadual),
    endereco: clientAddress(client),
    telefone: firstText(client.telefone, client.cliente_telefone, contact.contato_telefone, contact.contato_celular, contact.telefone),
    email: firstText(client.email, client.email_conferencia, client.contato_email, contact.contato_email, contact.email),
    responsavel: firstText(client.responsavel, client.contato, contact.contato_descricao, contact.nome),
    milvus_cliente_token: firstText(client.token, client.cliente_token),
    status: inactive ? 'inativo' : 'ativo'
  };
}

function addressRowsForClient(client) {
  const source = client.cliente_enderecos || client.enderecos || client.addresses || [];
  if (Array.isArray(source) && source.length) return source.filter((item) => item && typeof item === 'object');
  if (source && typeof source === 'object' && !Array.isArray(source)) return [source];
  if (clientAddress(client)) return [{ endereco_padrao: true, endereco_descricao: 'Sede', endereco: client.endereco || client.endereco_completo || client.address }];
  return [];
}

function isDefaultMilvusAddress(address) {
  return [address.endereco_padrao, address.is_padrao].some((value) => (
    value === true || value === 1 || ['true', '1', 'sim'].includes(String(value || '').trim().toLowerCase())
  ));
}

function normalizeMilvusAddress(address, index, defaultIndex, company) {
  const tipo = index === defaultIndex ? 'Sede' : 'Filial';
  const endereco = firstText(address.endereco_logradouro, address.logradouro, address.rua, address.endereco, address.endereco_completo, address.address);
  const numero = firstText(address.endereco_numero, address.numero);
  const complemento = firstText(address.endereco_complemento, address.complemento);
  const bairro = firstText(address.endereco_bairro, address.bairro);
  const cidade = firstText(address.endereco_cidade, address.cidade);
  const estado = firstText(address.endereco_estado, address.estado);
  const cep = firstText(address.endereco_cep, address.cep);
  const nome = firstText(address.endereco_descricao, address.descricao, address.nome, address.filial_nome)
    || (cidade ? `${tipo} — ${cidade}` : `${tipo}${tipo === 'Filial' ? ` ${index + 1}` : ''}`);
  const externalId = firstText(address.endereco_id, address.id, address.codigo, address.endereco_codigo);
  const fingerprint = [nome, endereco, numero, complemento, bairro, cidade, estado, cep]
    .map((value) => normalizeText(value || ''))
    .join('|');
  const milvus_endereco_key = externalId
    ? `id:${externalId}`
    : `hash:${crypto.createHash('sha256').update(fingerprint).digest('hex').slice(0, 32)}`;

  return {
    empresa_id: company.id,
    milvus_endereco_key,
    nome,
    tipo,
    codigo: firstText(address.codigo, address.endereco_codigo),
    cnpj: firstText(address.cnpj, address.endereco_cnpj),
    cep,
    endereco,
    numero,
    complemento,
    bairro,
    cidade,
    estado,
    status: company.status || 'ativo'
  };
}

async function syncMilvusClientAddresses(client, company) {
  const addresses = addressRowsForClient(client);
  if (!addresses.length) return { created: 0, updated: 0 };
  const defaultIndex = Math.max(0, addresses.findIndex(isDefaultMilvusAddress));
  const existingUnits = await db.getUnits(company.id);
  const byMilvusKey = new Map(existingUnits.filter((unit) => unit.milvus_endereco_key)
    .map((unit) => [unit.milvus_endereco_key, unit]));
  let created = 0;
  let updated = 0;

  for (const [index, source] of addresses.entries()) {
    const incoming = normalizeMilvusAddress(source, index, defaultIndex, company);
    const addressValues = ['nome', 'tipo', 'codigo', 'cnpj', 'cep', 'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'estado', 'status'];
    const sameNameAndAddress = existingUnits.find((item) => item.empresa_id === company.id
      && item.tipo === incoming.tipo
      && normalizeText(item.nome) === normalizeText(incoming.nome)
      && ['endereco', 'numero', 'complemento', 'bairro', 'cidade', 'estado', 'cep'].every((field) => (
        !incoming[field] || normalizeText(item[field] || '') === normalizeText(incoming[field])
      )));
    const defaultUnit = incoming.tipo === 'Sede'
      ? existingUnits.find((item) => item.empresa_id === company.id && item.tipo === 'Sede')
      : null;
    // Keep a single Sede when the address marked as default changes in Milvus.
    const unit = incoming.tipo === 'Sede'
      ? (defaultUnit || sameNameAndAddress || byMilvusKey.get(incoming.milvus_endereco_key))
      : (byMilvusKey.get(incoming.milvus_endereco_key) || sameNameAndAddress);

    if (unit) {
      const previousMilvusKey = unit.milvus_endereco_key;
      const patch = { milvus_endereco_key: incoming.milvus_endereco_key };
      for (const field of addressValues) {
        if (incoming[field] && incoming[field] !== unit[field]) patch[field] = incoming[field];
      }
      if (Object.keys(patch).some((field) => patch[field] !== unit[field])) {
        const saved = await db.updateUnit(unit.id, patch);
        Object.assign(unit, saved);
        updated++;
      }
      if (previousMilvusKey && previousMilvusKey !== incoming.milvus_endereco_key) {
        byMilvusKey.delete(previousMilvusKey);
      }
      byMilvusKey.set(incoming.milvus_endereco_key, unit);
      continue;
    }

    const saved = await db.createUnit(incoming);
    existingUnits.push(saved);
    byMilvusKey.set(incoming.milvus_endereco_key, saved);
    created++;
  }

  return { created, updated };
}

function formatPortalSchedule(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})$/);
  if (!match) return null;
  const [, year, month, day, time] = match;
  return `${day}/${month}/${year} às ${time}`;
}

async function syncMilvusClientes() {
  const clientes = await listarClientes();
  const companies = await db.getCompanies();
  const byToken = new Map();
  const byDocument = new Map();

  for (const company of companies) {
    if (company.milvus_cliente_token) byToken.set(String(company.milvus_cliente_token), company);
    const document = digitsOnly(company.cnpj);
    if (document) byDocument.set(document, company);
  }

  let novos = 0;
  let atualizados = 0;
  let ignorados = 0;
  let localizacoes = 0;
  let filiais_novas = 0;
  let filiais_atualizadas = 0;

  for (const client of clientes) {
    const incoming = normalizeMilvusClient(client);
    if (!incoming.razao_social || !incoming.cnpj) {
      ignorados++;
      continue;
    }
    if (incoming.endereco) localizacoes++;

    const existing = (incoming.milvus_cliente_token && byToken.get(incoming.milvus_cliente_token))
      || byDocument.get(incoming.cnpj);

    let savedCompany = existing;

    if (!existing) {
      const created = await db.createCompany(incoming);
      byDocument.set(incoming.cnpj, created);
      if (incoming.milvus_cliente_token) byToken.set(incoming.milvus_cliente_token, created);
      novos++;
    } else {
      const patch = {};
      for (const field of ['razao_social', 'nome_fantasia', 'inscricao_estadual', 'endereco', 'telefone', 'email', 'responsavel', 'milvus_cliente_token']) {
        if (!existing[field] && incoming[field]) patch[field] = incoming[field];
      }
      if (incoming.status === 'inativo' && existing.status === 'ativo') patch.status = 'inativo';

      if (Object.keys(patch).length) {
        savedCompany = await db.updateCompany(existing.id, patch);
        byDocument.set(incoming.cnpj, savedCompany);
        if (savedCompany.milvus_cliente_token) byToken.set(String(savedCompany.milvus_cliente_token), savedCompany);
        atualizados++;
      } else {
        ignorados++;
      }
    }

    const addressSync = await syncMilvusClientAddresses(client, savedCompany);
    filiais_novas += addressSync.created;
    filiais_atualizadas += addressSync.updated;
  }

  return { encontrados: clientes.length, novos, atualizados, ignorados, localizacoes, filiais_novas, filiais_atualizadas };
}

async function syncMilvusClienteEnderecos(empresaId) {
  const company = await db.getCompanyById(empresaId);
  if (!company) throw milvusError('Empresa não encontrada no sistema.', 404);
  if (!digitsOnly(company.cnpj)) {
    throw milvusError('Cadastre o CNPJ da empresa antes de buscar os endereços no Milvus.', 422);
  }

  const client = await buscarClientePorDocumento(company.cnpj);
  if (!client) {
    throw milvusError('Empresa não encontrada no Milvus pelo CNPJ cadastrado.', 404);
  }

  const addresses = addressRowsForClient(client);
  if (!addresses.length) {
    throw milvusError('O Milvus não retornou endereços cadastrados para esta empresa.', 422);
  }

  const result = await syncMilvusClientAddresses(client, company);
  return {
    empresa_id: company.id,
    enderecos_encontrados: addresses.length,
    filiais_novas: result.created,
    filiais_atualizadas: result.updated
  };
}

async function ensureRequestInMilvus(request, company, opts = {}) {
  if (request?.milvus_codigo) return request;
  if (!process.env.MILVUS_API_TOKEN) {
    throw milvusError('A integração com o Milvus não está configurada. O chamado não foi aberto.', 503);
  }
  const email = normalizeEmail(opts.email || request?.solicitante_email || company?.email);
  if (!isValidEmail(email)) {
    throw milvusError('Informe um e-mail válido do cliente para criar o chamado no Milvus.', 400);
  }
  if (!company?.cnpj) {
    throw milvusError('A empresa precisa ter um CNPJ cadastrado para criar o chamado no Milvus.', 422);
  }

  let clienteToken = company.milvus_cliente_token;
  if (!clienteToken) {
    const cliente = await buscarClientePorDocumento(company.cnpj);
    if (!cliente) {
      throw milvusError(`A empresa ${company.razao_social} não foi encontrada no Milvus pelo CNPJ. Cadastre o cliente no Milvus e tente novamente.`, 422);
    }
    clienteToken = cliente.token;
    await db.updateCompany(company.id, { milvus_cliente_token: clienteToken });
  }

  const equipmentLabel = opts.equipment
    ? `${opts.equipment.modelo || 'Equipamento'}${opts.equipment.numero_serie ? ` — série ${opts.equipment.numero_serie}` : ''}`
    : 'não informado';
  const assigneeEmail = normalizeEmail(opts.assignee?.milvus_email || opts.tecnicoEmail);
  if (opts.assignee && !isValidEmail(assigneeEmail)) {
    throw milvusError(`O usuário ${opts.assignee.nome} ainda não está vinculado ao cadastro correspondente no Milvus.`, 422);
  }
  const descricao = [
    'Chamado aberto automaticamente pelo sistema Mirontec.',
    '',
    `Chamado interno: #${request.numero}`,
    `Cliente: ${company.razao_social}`,
    `Contato: ${opts.contato || company.responsavel || 'não informado'}`,
    `E-mail: ${email}`,
    `Telefone: ${opts.telefone || company.telefone || 'não informado'}`,
    `Equipamento: ${equipmentLabel}`,
    `Descrição: ${request.descricao}`,
    `Urgência: ${request.urgencia}`,
    `Endereço: ${request.endereco || 'não informado'}`
  ].join('\n');

  const codigo = await criarChamado({
    clienteToken,
    assunto: `VISITA TÉCNICA — Chamado #${request.numero}`,
    descricao,
    email,
    telefone: opts.telefone || company.telefone,
    contato: opts.contato || company.responsavel,
    tecnicoEmail: assigneeEmail || null
  });

  if (!codigo) {
    throw milvusError('O Milvus não retornou o número do chamado. Tente novamente.', 502);
  }
  const updated = await db.updateRequest(request.id, { milvus_codigo: String(codigo), solicitante_email: email });
  console.log(`[milvus] Chamado #${request.numero} vinculado ao ticket #${codigo}`);
  return updated;
}

async function syncRequestAssigneeToMilvus(request, { analyst, technician, includeAccompaniment = true } = {}) {
  if (!request?.milvus_codigo) {
    throw milvusError('O chamado ainda não está vinculado ao Milvus.', 409);
  }
  if (!process.env.MILVUS_API_TOKEN) {
    throw milvusError('A integração com o Milvus não está configurada.', 503);
  }

  const responsible = technician || analyst || null;
  if (responsible && (!isValidEmail(responsible.milvus_email) || !responsible.milvus_nome?.trim())) {
    throw milvusError(`O usuário ${responsible.nome} ainda não está vinculado ao cadastro correspondente no Milvus.`, 422);
  }

  let resolvedMilvusId;
  try {
    resolvedMilvusId = await atualizarResponsavelChamado({
      ticketCodigo: request.milvus_codigo,
      ticketId: request.milvus_id,
      tecnicoNome: responsible?.milvus_nome || ''
    });
  } catch (error) {
    throw milvusError(`Não foi possível atribuir ${responsible?.nome || 'o responsável'} ao ticket #${request.milvus_codigo} no Milvus. Confira o vínculo do usuário e tente novamente.`, 502);
  }
  if (!request.milvus_id && resolvedMilvusId) {
    await db.updateRequest(request.id, { milvus_id: resolvedMilvusId });
  }

  if (includeAccompaniment) {
    const lines = ['Responsáveis atualizados automaticamente pelo portal Mirontec.'];
    if (analyst) lines.push(`Analista: ${analyst.nome}.`);
    if (technician) lines.push(`Técnico de campo: ${technician.nome}.`);
    if (!analyst && !technician) lines.push('Chamado sem responsável atribuído no portal.');
    try {
      await criarAcompanhamento({ ticketCodigo: request.milvus_codigo, descricao: lines.join('\n'), privado: true });
    } catch (error) {
      console.warn(`[milvus] Responsável do ticket #${request.milvus_codigo} atualizado, mas o acompanhamento não foi criado: ${error.message}`);
    }
  }
}

async function syncRequestScheduleToMilvus(request, { actor } = {}) {
  if (!request?.milvus_codigo || !process.env.MILVUS_API_TOKEN || !request.agendado_para) return false;
  try {
    const start = formatPortalSchedule(request.agendado_para) || request.agendado_para;
    const end = formatPortalSchedule(request.agendado_ate);
    const technician = request.assigned_technician ? await db.getUserById(request.assigned_technician) : null;
    const lines = [`Visita técnica agendada pelo portal para ${start}${end ? ` até ${end}` : ''}.`];
    if (Array.isArray(request.dias_visita) && request.dias_visita.length > 1) {
      const workDays = request.dias_visita.map((day) => {
        const dayStart = formatPortalSchedule(`${day.date}T${day.start}`) || `${day.date} às ${day.start}`;
        const dayEnd = day.end ? ` até ${formatPortalSchedule(`${day.date}T${day.end}`) || day.end}` : '';
        return `${dayStart}${dayEnd}`;
      });
      lines.push(`Dias de trabalho previstos: ${workDays.join('; ')}.`);
    }
    if (technician?.nome) lines.push(`Técnico: ${technician.nome}.`);
    if (request.endereco) lines.push(`Endereço: ${request.endereco}.`);
    await criarAcompanhamento({ ticketCodigo: request.milvus_codigo, descricao: lines.join('\n'), privado: true });
    console.log(`[milvus] Agenda do chamado #${request.numero} sincronizada com o ticket #${request.milvus_codigo}`);
    return true;
  } catch (error) {
    console.error(`[milvus] Falha ao sincronizar a agenda do chamado #${request.numero}:`, error.message);
    return false;
  }
}

async function syncRequestScheduleRemovalToMilvus() {
  // A API do Milvus não oferece uma operação documentada para excluir acompanhamentos.
  // Não adicionamos uma segunda mensagem ao ticket quando a agenda é removida.
  return null;
}

async function pushVisitaTecnicaAprovadaToMilvus(budget, request, company, items, opts = {}) {
  if (!process.env.MILVUS_API_TOKEN) return;

  try {
    const { assunto, descricao } = buildMilvusPayload({ budget, items, request });

    const existingTicket = request?.milvus_codigo || budget.milvus_codigo;
    if (existingTicket) {
      await criarAcompanhamento({
        ticketCodigo: existingTicket,
        descricao: `${assunto}\n\n${descricao}`
      });
      if (budget.milvus_codigo !== existingTicket) {
        await db.updateBudget(budget.id, { milvus_codigo: existingTicket });
      }
      console.log(`[milvus] Visita técnica aprovada (orçamento #${budget.id}) atualizada no ticket existente #${existingTicket}`);
      return;
    }

    const linkedRequest = await ensureRequestInMilvus(request, company, {
      email: opts.email,
      telefone: opts.telefone,
      contato: opts.contato
    });
    await criarAcompanhamento({ ticketCodigo: linkedRequest.milvus_codigo, descricao: `${assunto}\n\n${descricao}` });
    await db.updateBudget(budget.id, { milvus_codigo: linkedRequest.milvus_codigo });
    console.log(`[milvus] Visita técnica aprovada (orçamento #${budget.id}) vinculada ao ticket #${linkedRequest.milvus_codigo}`);
  } catch (err) {
    console.error(`[milvus] Falha ao enviar visita técnica aprovada (orçamento #${budget.id}) ao Milvus:`, err.message);
  }
}

// Mantém o ticket vinculado ao chamado atualizado conforme o atendimento
// avança. O orçamento aprovado fornece peças/custos, mas não é necessário
// para registrar a conclusão da visita no ticket do Milvus.
async function syncRequestUpdateToMilvus(request, { tipo, technician, approvedParts = [] }) {
  if (!process.env.MILVUS_API_TOKEN) return false;

  try {
    const budgets = await db.getBudgets();
    const aprovado = budgets.find((b) => b.request_id === request.id && b.status === 'Aprovado');
    const ticketCodigo = request.milvus_codigo || aprovado?.milvus_codigo;
    if (!ticketCodigo) return false;

    if (tipo === 'checkin') {
      await criarAcompanhamento({
        ticketCodigo,
        descricao: `Check-in realizado${technician ? ` pelo técnico ${technician}` : ''} em ${new Date(request.hora_checkin).toLocaleString('pt-BR')}.`
      });
      console.log(`[milvus] Check-in do chamado #${request.numero} sincronizado com o ticket #${ticketCodigo}`);
      return true;
    } else if (tipo === 'concluida' || tipo === 'concluida_administrativamente') {
      const resumo = buildCompletionSummary({ request, approvedParts, technician });
      const completedAt = request.hora_checkout || request.concluded_at || new Date().toISOString();
      const completionLabel = tipo === 'concluida_administrativamente'
        ? `Visita confirmada como realizada pelo gestor/analista em ${new Date(completedAt).toLocaleString('pt-BR')}.`
        : `Check-out em ${new Date(completedAt).toLocaleString('pt-BR')}.`;
      await criarAcompanhamento({
        ticketCodigo,
        descricao: `${completionLabel}\n\n${resumo}`
      });
      await finalizarChamado({ ticketCodigo, servicoRealizado: resumo });
      console.log(`[milvus] Conclusão do chamado #${request.numero} sincronizada com o ticket #${ticketCodigo}`);
      return true;
    }
    return false;
  } catch (err) {
    console.error(`[milvus] Falha ao sincronizar atualização do chamado #${request.numero}:`, err.message);
    return false;
  }
}

async function syncRequestDisapprovalToMilvus(request, { actor, previousReport } = {}) {
  if (!process.env.MILVUS_API_TOKEN || !request?.milvus_codigo) return false;

  try {
    await criarAcompanhamento({
      ticketCodigo: request.milvus_codigo,
      privado: true,
      descricao: [
        `A visita do chamado #${request.numero} foi desaprovada no portal por ${actor || 'um responsável'}.`,
        'O chamado foi reaberto no portal e o pagamento voltou para Pendente.',
        'Este registro informa a reversão no portal; o status do ticket no Milvus pode precisar ser atualizado separadamente.',
        previousReport ? `Relatório registrado anteriormente: ${previousReport}` : null
      ].filter(Boolean).join('\n')
    });
    return true;
  } catch (err) {
    console.error(`[milvus] Falha ao registrar desaprovação da visita #${request.numero}:`, err.message);
    return false;
  }
}

module.exports = {
  syncMilvusChamados,
  syncMilvusClientes,
  syncMilvusClienteEnderecos,
  ensureRequestInMilvus,
  syncRequestAssigneeToMilvus,
  syncRequestScheduleToMilvus,
  syncRequestScheduleRemovalToMilvus,
  pushVisitaTecnicaAprovadaToMilvus,
  syncRequestUpdateToMilvus,
  syncRequestDisapprovalToMilvus
};
