const TITULO_VISITA_TECNICA = 'VISITA TÉCNICA';

function money(value) {
  return `R$ ${Number(value || 0).toFixed(2)}`;
}

function pecasLabel(items) {
  return items.map((item) => `${item.nome}${item.quantidade > 1 ? ` (x${item.quantidade})` : ''}`).join(', ');
}

function buildDescricao({ budget, items, request }) {
  const linhas = [
    `Peça: ${pecasLabel(items) || 'não informado'}`,
    `Quantidade: ${items.reduce((sum, item) => sum + Number(item.quantidade || 0), 0)}`,
    `Motivo da troca: ${budget.motivo_troca || 'não informado'}`,
    `Informações relevantes: ${budget.observacoes_tecnicas || 'nenhuma'}`,
    `Valor da peça: ${money(budget.pecas_total)}`,
    `Valor da visita técnica: ${money(budget.deslocamento)}`,
    `Valor total: ${money(budget.total)}`
  ];
  if (request?.descricao) {
    linhas.unshift(`Problema identificado: ${request.descricao}`);
  }
  return linhas.join('\n');
}

function buildRealizado(items) {
  const nomes = pecasLabel(items) || 'peça informada';
  return `REALIZADO: Substituição da peça ${nomes} e realização dos procedimentos técnicos necessários para conclusão do serviço.`;
}

function buildMilvusPayload({ budget, items, request }) {
  const descricao = buildDescricao({ budget, items, request });
  const realizado = buildRealizado(items);
  const quemAutorizou = budget.aprovacao_nome
    ? `${budget.aprovacao_nome} (CPF ${budget.aprovacao_cpf || 'não informado'}, tel ${budget.aprovacao_telefone || 'não informado'})`
    : (budget.autorizado_por || 'autorização registrada');
  const autorizacao = `AUTORIZAÇÃO: Cliente autorizou a realização da visita técnica e a substituição da peça. Autorizado por ${quemAutorizou} em ${new Date(budget.aprovado_em || Date.now()).toLocaleString('pt-BR')}.`;

  return {
    assunto: TITULO_VISITA_TECNICA,
    descricao: [descricao, '', realizado, '', 'STATUS: APROVADO PELO CLIENTE', autorizacao].join('\n')
  };
}

module.exports = { TITULO_VISITA_TECNICA, buildDescricao, buildRealizado, buildMilvusPayload };
