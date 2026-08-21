const {
  composeSections,
  formatDateTime,
  isRepeated,
  joinNatural,
  money,
  partInSentence,
  partWithQuantity,
  section,
  sentence
} = require('./technicalWriting');

const TITULO_VISITA_TECNICA = 'VISITA TÉCNICA';

function buildAuthorizedService(items = []) {
  if (!items.length) return 'O cliente autorizou a realização da visita técnica.';
  const parts = joinNatural(items.map(partInSentence));
  return sentence(items.length === 1
    ? `Foi autorizada a substituição de ${parts}`
    : `Foram autorizadas as substituições de ${parts}`);
}

function buildPartsSection(items = []) {
  if (!items.length) return '';
  const blocks = [];
  for (const item of items) {
    const lines = [partWithQuantity(item)];
    const unitPrice = Number(item.valor_unitario || 0);
    if (unitPrice > 0) {
      lines.push(`Valor unitário: ${money(unitPrice)}`);
      if (Number(item.quantidade || 0) > 1) lines.push(`Subtotal: ${money(unitPrice * Number(item.quantidade))}`);
    }
    blocks.push(lines.join('\n'));
  }
  return section(items.length === 1 ? 'Peça autorizada' : 'Peças autorizadas', blocks.join('\n\n'));
}

function buildValuesSection(budget) {
  const lines = [];
  if (Number(budget.deslocamento || 0) > 0) lines.push(`Visita técnica: ${money(budget.deslocamento)}`);
  if (Number(budget.pecas_total || 0) > 0) lines.push(`Peças: ${money(budget.pecas_total)}`);
  if (Number(budget.total || 0) > 0) lines.push(`Total: ${money(budget.total)}`);
  return section('Valores do atendimento', lines);
}

function buildDescricao({ budget, items = [], request }) {
  const problem = sentence(request?.descricao);
  const reason = sentence(budget?.motivo_troca);
  const notes = sentence(budget?.observacoes_tecnicas);
  const seen = [problem];
  const diagnosisSection = reason && !isRepeated(reason, seen) ? section('Motivo da troca', reason) : '';
  if (reason) seen.push(reason);
  const notesSection = notes && !isRepeated(notes, seen) ? section('Informações do atendimento', notes) : '';

  return composeSections([
    section('Problema identificado', problem),
    diagnosisSection,
    section('Serviço autorizado', buildAuthorizedService(items)),
    buildPartsSection(items),
    notesSection,
    buildValuesSection(budget || {})
  ]);
}

// Alias mantido para os consumidores existentes. Nesta etapa o serviço foi
// autorizado pelo cliente, mas ainda não foi executado pelo técnico.
function buildRealizado(items = []) {
  return buildAuthorizedService(items);
}

function buildAuthorization(budget, items = []) {
  const authorization = items.length
    ? 'O cliente autorizou a realização da visita técnica e a substituição das peças descritas neste registro.'
    : 'O cliente autorizou a realização da visita técnica.';
  const responsible = budget.aprovacao_nome || budget.autorizado_por;
  const approvedAt = formatDateTime(budget.aprovado_em);
  const responsibleLine = responsible
    ? `Autorizado por ${responsible}${approvedAt ? ` em ${approvedAt}` : ''}.`
    : (approvedAt ? `Autorização registrada em ${approvedAt}.` : '');
  return section('Autorização', [authorization, responsibleLine]);
}

function buildMilvusPayload({ budget, items = [], request }) {
  return {
    assunto: TITULO_VISITA_TECNICA,
    descricao: composeSections([
      TITULO_VISITA_TECNICA,
      buildDescricao({ budget, items, request }),
      section('Status', '🟢 Aprovado pelo cliente'),
      buildAuthorization(budget, items)
    ])
  };
}

module.exports = {
  TITULO_VISITA_TECNICA,
  buildAuthorization,
  buildAuthorizedService,
  buildDescricao,
  buildMilvusPayload,
  buildPartsSection,
  buildRealizado,
  buildValuesSection
};
