const db = require('./db');
const { calculateBudgetTotal } = require('./pricing');
const { isValidEmail, normalizeEmail, resolveContactEmail } = require('./contact');
const {
  analyzeMilvusBudget,
  formatAddress,
  inferUrgency,
  matchCompanyFromTicket,
  matchEquipmentFromTicket,
  matchUnitFromTicket,
  normalizeText,
  parseRawTicket,
  rawValue,
  ticketText
} = require('./milvusDraft');

const TAXA_MOTORISTA = Number(process.env.TAXA_MOTORISTA || 100);

function importError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.expose = true;
  return error;
}

function resolveMilvusUser(pendente, users = []) {
  const raw = parseRawTicket(pendente);
  const technicalIdentity = rawValue(raw, [
    'email_tecnico', 'tecnico_email', 'chamado_tecnico_email', 'chamado_tecnico', 'tecnico', 'responsavel'
  ]);
  const email = normalizeEmail(technicalIdentity);
  const name = normalizeText(technicalIdentity);
  return users.find((user) => user.ativo && (
    (isValidEmail(email) && normalizeEmail(user.milvus_email || user.email) === email)
    || (name && [user.milvus_nome, user.nome].map(normalizeText).includes(name))
  )) || null;
}

function resolveAutomaticTicket(pendente, { companies, units, equipments, parts }) {
  const company = matchCompanyFromTicket(pendente, companies, units);
  if (!company) return { ready: false, reason: 'Aguardando revisão: não foi possível identificar uma única empresa.' };

  const unit = matchUnitFromTicket(pendente, company, units);
  const equipment = matchEquipmentFromTicket(pendente, company, unit, equipments);
  if (!equipment) return { ready: false, reason: 'Aguardando revisão: não foi possível identificar um único equipamento.' };

  const analysis = analyzeMilvusBudget(pendente, parts);
  if (!analysis.items.length) {
    return { ready: false, reason: 'Aguardando revisão: nenhuma peça do catálogo foi identificada no texto do Milvus.' };
  }

  const effectiveUnit = unit || (equipment.unidade_id ? units.find((item) => item.id === equipment.unidade_id) : null);
  const contactEmail = resolveContactEmail({
    request: { solicitante_email: pendente.cliente_email },
    unit: effectiveUnit,
    company
  });
  if (!isValidEmail(contactEmail)) {
    return { ready: false, reason: 'Aguardando revisão: o cliente está sem um e-mail válido.' };
  }

  return { ready: true, company, unit: effectiveUnit, equipment, analysis, contactEmail };
}

async function cleanupPartialImport({ budget, request }) {
  try {
    if (budget?.id) await db.deleteBudget(budget.id);
    if (request?.id) await db.deleteRequest(request.id);
  } catch (error) {
    console.error('[milvus-auto] Não foi possível desfazer totalmente uma importação incompleta:', error.message);
  }
}

async function importMilvusPendingTicket({ pendente, mapping, actorUser = null, automatic = false, analysis: providedAnalysis = null }) {
  const { empresa_id, equipamento_id, unidade_id, urgencia, endereco, solicitante_email } = mapping;
  if (!empresa_id || !equipamento_id) throw importError('Selecione a empresa e o equipamento');

  const [company, equipment, allParts, users] = await Promise.all([
    db.getCompanyById(empresa_id),
    db.getEquipmentById(equipamento_id),
    db.getParts(),
    db.getUsers()
  ]);
  if (!company) throw importError('Empresa inválida');
  if (!equipment || equipment.empresa_id !== empresa_id) throw importError('Equipamento inválido para esta empresa');

  const effectiveUnitId = unidade_id || equipment.unidade_id || null;
  const unit = effectiveUnitId ? await db.getUnitById(effectiveUnitId) : null;
  if (effectiveUnitId && (!unit || unit.empresa_id !== empresa_id)) throw importError('Filial/sede inválida para esta empresa');

  const contactEmail = resolveContactEmail({
    provided: solicitante_email,
    request: { solicitante_email: pendente.cliente_email },
    unit,
    company
  });
  if (!isValidEmail(contactEmail)) throw importError('Informe um e-mail válido do cliente antes de importar o chamado.');

  const analysis = providedAnalysis || analyzeMilvusBudget(pendente, allParts);
  const mappedMilvusUser = resolveMilvusUser(pendente, users);
  const assignedAnalyst = mappedMilvusUser?.role === 'analista'
    ? mappedMilvusUser.id
    : (actorUser?.role === 'analista' ? actorUser.id : null);
  const assignedTechnician = mappedMilvusUser?.role === 'tecnico' ? mappedMilvusUser.id : null;
  const responsibleUser = mappedMilvusUser || actorUser;
  const claimed = await db.claimMilvusPendente(pendente.id);
  if (!claimed) throw importError('Este ticket já está sendo processado ou foi importado', 409);

  let request = null;
  let budget = null;
  try {
    if (!company.email) {
      await db.updateCompany(company.id, { email: contactEmail });
      company.email = contactEmail;
    }

    const descricao = ticketText(pendente) || `Chamado Milvus #${pendente.milvus_codigo}`;
    request = await db.createRequest({
      empresa_id,
      equipamento_id,
      descricao,
      urgencia: urgencia || inferUrgency(pendente),
      endereco: endereco || formatAddress(company, unit),
      aberto_por: actorUser?.id || mappedMilvusUser?.id || null,
      assigned_analyst: assignedAnalyst,
      assigned_technician: assignedTechnician,
      solicitante_email: contactEmail,
      milvus_codigo: pendente.milvus_codigo,
      milvus_id: pendente.milvus_id
    });

    const deslocamento = unit?.valor_deslocamento_padrao != null
      ? Number(unit.valor_deslocamento_padrao) + TAXA_MOTORISTA
      : 0;
    const { pecasTotal, deslocamentoTotal, total } = calculateBudgetTotal({ items: analysis.items, deslocamento });
    budget = await db.createBudget({
      request_id: request.id,
      draft_by: responsibleUser?.id || null,
      empresa_id,
      unidade_id: unit?.id || null,
      pecas_total: pecasTotal,
      total,
      deslocamento: deslocamentoTotal,
      motivo_troca: analysis.motivo_troca || null,
      observacoes_tecnicas: analysis.observacoes_tecnicas || null
    }, analysis.items);
    budget = await db.updateBudget(budget.id, { milvus_codigo: pendente.milvus_codigo });

    const partsLabel = analysis.matchedParts
      .map((part) => `${part.nome} × ${part.quantidade}`)
      .join(', ');
    await db.updateMilvusPendente(pendente.id, {
      status: 'importado',
      request_id: request.id,
      auto_observacao: automatic
        ? `Importado automaticamente. Orçamento em rascunho com: ${partsLabel}.`
        : `Importado manualmente. Orçamento em rascunho com: ${partsLabel || 'nenhuma peça identificada'}.`
    });

    const auditUser = actorUser || responsibleUser || { nome: 'Automação Milvus' };
    await db.logAudit({
      user: auditUser,
      acao: automatic ? 'milvus_chamado_importado_automatico' : 'milvus_chamado_importado',
      entidade: 'request',
      entidade_id: request.id,
      detalhes: `Importado do Milvus (ticket #${pendente.milvus_codigo}) — ${descricao}`
    });
    await db.logAudit({
      user: auditUser,
      acao: 'orcamento_criado_automatico',
      entidade: 'budget',
      entidade_id: budget.id,
      detalhes: `Rascunho criado para o chamado #${request.numero} — ${analysis.items.length} peça(s): ${partsLabel || 'nenhuma'}. Motivo: ${analysis.motivo_troca || 'não informado no Milvus'}`
    });

    return { request, budget, analysis };
  } catch (error) {
    await cleanupPartialImport({ budget, request });
    await db.updateMilvusPendente(pendente.id, {
      status: 'pendente',
      request_id: null,
      auto_observacao: automatic
        ? 'A automação não conseguiu concluir a importação. O ticket continua disponível para revisão.'
        : pendente.auto_observacao || null
    }).catch(() => {});
    throw error;
  }
}

async function autoImportMilvusPendentes() {
  await db.releaseStaleMilvusClaims();
  const pendentes = await db.getMilvusPendentes('pendente');
  if (!pendentes.length) return { importados: 0, aguardando_revisao: 0 };
  const [companies, units, equipments, parts, users] = await Promise.all([
    db.getCompanies(),
    db.getUnits(),
    db.getEquipments(),
    db.getParts(),
    db.getUsers()
  ]);
  let importados = 0;
  let aguardandoRevisao = 0;

  for (const pendente of pendentes) {
    const resolution = resolveAutomaticTicket(pendente, { companies, units, equipments, parts });
    if (!resolution.ready) {
      await db.updateMilvusPendente(pendente.id, { auto_observacao: resolution.reason });
      aguardandoRevisao++;
      continue;
    }

    const mappedUser = resolveMilvusUser(pendente, users);
    try {
      await importMilvusPendingTicket({
        pendente,
        mapping: {
          empresa_id: resolution.company.id,
          unidade_id: resolution.unit?.id || null,
          equipamento_id: resolution.equipment.id,
          urgencia: inferUrgency(pendente),
          endereco: formatAddress(resolution.company, resolution.unit),
          solicitante_email: resolution.contactEmail
        },
        actorUser: mappedUser,
        automatic: true,
        analysis: resolution.analysis
      });
      importados++;
    } catch (error) {
      console.error(`[milvus-auto] Ticket #${pendente.milvus_codigo} permaneceu para revisão:`, error.message);
      aguardandoRevisao++;
    }
  }

  return { importados, aguardando_revisao: aguardandoRevisao };
}

module.exports = {
  autoImportMilvusPendentes,
  importMilvusPendingTicket,
  resolveAutomaticTicket,
  resolveMilvusUser
};
