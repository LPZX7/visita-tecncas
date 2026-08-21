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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatApprovedParts(items = []) {
  return items.map(partWithQuantity).join('\n');
}

function buildAutomaticServiceReport(approvedParts = []) {
  if (!approvedParts.length) {
    return 'Atendimento concluído no local.';
  }
  const parts = joinNatural(approvedParts.map(partInSentence));
  return sentence(approvedParts.length === 1
    ? `Foi substituída ${parts}`
    : `Foram substituídas ${parts}`);
}

function buildCompletionSummary({ request, approvedParts = [], technician, includeStatusIcon = true }) {
  const hadAdditional = Boolean(request.teve_adicional);
  const problem = sentence(request.descricao);
  const service = sentence(request.relatorio_visita);
  const observation = sentence(request.observacao_final);
  const additionalLines = [];
  if (hadAdditional) {
    additionalLines.push(sentence(request.adicional_descricao));
    if (Number(request.custo_adicional || 0) > 0) additionalLines.push(`Valor informado: ${money(request.custo_adicional)}`);
  }
  const completedAt = formatDateTime(request.hora_checkout || request.concluded_at);
  const registration = technician
    ? `Atendimento concluído por ${technician}${completedAt ? ` em ${completedAt}` : ''}.`
    : (completedAt ? `Atendimento concluído em ${completedAt}.` : '');

  return composeSections([
    section('Problema identificado', problem),
    section('Serviço realizado', service),
    section(approvedParts.length === 1 ? 'Peça utilizada' : 'Peças utilizadas', formatApprovedParts(approvedParts)),
    section('Item ou custo adicional', additionalLines),
    observation && !isRepeated(observation, [problem, service]) ? section('Observações finais', observation) : '',
    section('Status', `${includeStatusIcon ? '🟢 ' : ''}Visita concluída`),
    section('Registro', registration)
  ]);
}

function buildCompletionEmail({ request, company, unit, equipment, technician, approvedParts = [], portalUrl }) {
  const summary = buildCompletionSummary({ request, approvedParts, technician: technician?.nome });
  const destination = unit ? `${unit.tipo} — ${unit.nome}` : company?.razao_social;
  const equipmentLabel = equipment ? `${equipment.modelo} — Série ${equipment.numero_serie}` : 'Não informado';
  const subject = `Visita técnica concluída — chamado #${request.numero}`;
  const text = [
    'Olá,',
    '',
    `A visita técnica do chamado #${request.numero} foi concluída.`,
    `Empresa/unidade: ${destination || 'Não informada'}`,
    `Equipamento: ${equipmentLabel}`,
    `Técnico: ${technician?.nome || 'Não informado'}`,
    '',
    summary,
    '',
    'Caso exista valor adicional, ele foi registrado para conferência da equipe.',
    `Acompanhe o atendimento: ${portalUrl}`
  ].join('\n');

  const summaryHtml = escapeHtml(summary).replaceAll('\n', '<br />');

  const html = `
  <div style="background:#f1f5f9;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
      <div style="background:#0f172a;padding:26px 30px;color:#ffffff;">
        <div style="font-size:13px;opacity:.75;margin-bottom:6px;">MIRONTEC SERVICE</div>
        <h1 style="margin:0;font-size:22px;">Visita técnica concluída</h1>
        <p style="margin:8px 0 0;color:#cbd5e1;">Chamado #${escapeHtml(request.numero)}</p>
      </div>
      <div style="padding:28px 30px;">
        <p style="margin:0 0 20px;color:#475569;line-height:1.6;">O atendimento foi finalizado pelo técnico. Confira abaixo o resumo registrado no sistema e no Milvus.</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;margin-bottom:20px;line-height:1.6;color:#334155;">
          <strong>${escapeHtml(destination || 'Empresa não informada')}</strong><br />
          Equipamento: ${escapeHtml(equipmentLabel)}<br />
          Técnico: ${escapeHtml(technician?.nome || 'Não informado')}
        </div>
        <div style="padding:18px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;color:#334155;font-size:14px;line-height:1.65;">${summaryHtml}</div>
        <p style="margin:20px 0;color:#64748b;font-size:13px;line-height:1.5;">Caso exista valor adicional, ele foi registrado para conferência da equipe.</p>
        <div style="text-align:center;margin-top:24px;"><a href="${escapeHtml(portalUrl)}" style="background:#2563eb;color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:600;display:inline-block;">Acompanhar atendimento</a></div>
      </div>
    </div>
  </div>`;

  return { subject, text, html, summary };
}

module.exports = { buildAutomaticServiceReport, buildCompletionSummary, buildCompletionEmail, formatApprovedParts };
