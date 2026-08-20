function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatApprovedParts(items = []) {
  if (!items.length) return 'Nenhuma peça registrada no orçamento aprovado.';
  return items
    .map((item) => `${item.nome}${Number(item.quantidade || 0) > 1 ? ` (x${item.quantidade})` : ''}`)
    .join(', ');
}

function buildAutomaticServiceReport(approvedParts = []) {
  const parts = formatApprovedParts(approvedParts);
  if (!approvedParts.length) {
    return 'Atendimento técnico realizado e concluído no local.';
  }
  return `Substituição de ${parts} e conclusão do atendimento técnico no local.`;
}

function buildCompletionSummary({ request, approvedParts = [] }) {
  const hadAdditional = Boolean(request.teve_adicional);
  const lines = [
    `Serviço realizado: ${request.relatorio_visita}`,
    `Peças previstas/aprovadas: ${formatApprovedParts(approvedParts)}`,
    `Houve peça ou custo adicional: ${hadAdditional ? 'Sim' : 'Não'}`
  ];

  if (hadAdditional) {
    lines.push(`Item/custo adicional informado: ${request.adicional_descricao}`);
    lines.push(`Valor adicional informado: ${money(request.custo_adicional)}`);
  }

  if (request.observacao_final) {
    lines.push(`Observação do técnico: ${request.observacao_final}`);
  }

  return lines.join('\n');
}

function buildCompletionEmail({ request, company, unit, equipment, technician, approvedParts = [], portalUrl }) {
  const summary = buildCompletionSummary({ request, approvedParts });
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

  const summaryRows = summary.split('\n').map((line) => {
    const separator = line.indexOf(':');
    const label = separator >= 0 ? line.slice(0, separator) : line;
    const value = separator >= 0 ? line.slice(separator + 1).trim() : '';
    return `<tr><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;vertical-align:top;width:38%;"><strong>${escapeHtml(label)}</strong></td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:14px;white-space:pre-wrap;">${escapeHtml(value)}</td></tr>`;
  }).join('');

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
        <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">${summaryRows}</table>
        <p style="margin:20px 0;color:#64748b;font-size:13px;line-height:1.5;">Caso exista valor adicional, ele foi registrado para conferência da equipe.</p>
        <div style="text-align:center;margin-top:24px;"><a href="${escapeHtml(portalUrl)}" style="background:#2563eb;color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:600;display:inline-block;">Acompanhar atendimento</a></div>
      </div>
    </div>
  </div>`;

  return { subject, text, html, summary };
}

module.exports = { buildAutomaticServiceReport, buildCompletionSummary, buildCompletionEmail, formatApprovedParts };
