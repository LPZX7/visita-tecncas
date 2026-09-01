function validateVisitExecution(request, nextStatus) {
  if (!['Em Atendimento', 'Concluída'].includes(nextStatus)) return null;
  if (request?.aprovacao_cliente === 'aprovado') return null;
  return 'A visita ainda não foi autorizada. Envie o orçamento e aguarde a aprovação do cliente antes de iniciar o atendimento.';
}

module.exports = { validateVisitExecution };
