const db = require('./db');
const {
  listarChamadosVisitaTecnica,
  buscarClientePorDocumento,
  criarChamado,
  atualizarResponsavelChamado,
  criarAcompanhamento,
  finalizarChamado
} = require('./milvus');
const { buildMilvusPayload } = require('./visitaTecnicaFormat');
const { buildCompletionSummary } = require('./visitCompletion');
const { isValidEmail, normalizeEmail } = require('./contact');
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

  let automatico = { importados: 0, aguardando_revisao: 0 };
  try {
    automatico = await autoImportMilvusPendentes();
  } catch (error) {
    console.error('[milvus-auto] Falha ao processar a fila automática:', error.message);
  }

  return {
    encontrados: lista.length,
    novos,
    importados_automaticamente: automatico.importados,
    aguardando_revisao: automatico.aguardando_revisao
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

async function syncRequestAssigneeToMilvus(request, { analyst, technician } = {}) {
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

// Depois que a visita técnica já foi aprovada e criada no Milvus (budget com
// milvus_codigo), mantém aquele mesmo ticket atualizado conforme o
// atendimento avança — check-in, check-out e conclusão. Não faz nada se o
// chamado ainda não tiver orçamento aprovado com ticket no Milvus.
async function syncRequestUpdateToMilvus(request, { tipo, technician, approvedParts = [] }) {
  if (!process.env.MILVUS_API_TOKEN) return;

  try {
    const budgets = await db.getBudgets();
    const aprovado = budgets.find((b) => b.request_id === request.id && b.status === 'Aprovado');
    const ticketCodigo = request.milvus_codigo || aprovado?.milvus_codigo;
    if (!aprovado || !ticketCodigo) return;

    if (tipo === 'checkin') {
      await criarAcompanhamento({
        ticketCodigo,
        descricao: `Check-in realizado${technician ? ` pelo técnico ${technician}` : ''} em ${new Date(request.hora_checkin).toLocaleString('pt-BR')}.`
      });
      console.log(`[milvus] Check-in do chamado #${request.numero} sincronizado com o ticket #${ticketCodigo}`);
    } else if (tipo === 'concluida') {
      const resumo = buildCompletionSummary({ request, approvedParts, technician });
      await criarAcompanhamento({
        ticketCodigo,
        descricao: `Check-out em ${new Date(request.hora_checkout).toLocaleString('pt-BR')}.\n\n${resumo}`
      });
      await finalizarChamado({ ticketCodigo, servicoRealizado: resumo });
      console.log(`[milvus] Conclusão do chamado #${request.numero} sincronizada com o ticket #${ticketCodigo}`);
    }
  } catch (err) {
    console.error(`[milvus] Falha ao sincronizar atualização do chamado #${request.numero}:`, err.message);
  }
}

module.exports = {
  syncMilvusChamados,
  ensureRequestInMilvus,
  syncRequestAssigneeToMilvus,
  pushVisitaTecnicaAprovadaToMilvus,
  syncRequestUpdateToMilvus
};
