function isVisitReleasedForExecution(request) {
  const scheduledByTeam = request?.status === 'Agendada' && Boolean(request?.agendado_para);
  const alreadyStarted = request?.status === 'Em Atendimento' && Boolean(request?.hora_checkin);
  return (scheduledByTeam || alreadyStarted)
    && Boolean(request?.milvus_codigo)
    && request?.aprovacao_cliente !== 'recusado';
}

function canManagerCompleteStartedVisit(request, nextStatus, actorRole, visitAlreadyCompleted) {
  return actorRole === 'gestor'
    && nextStatus === 'Concluída'
    && request?.status !== 'Concluída'
    && Boolean(request?.hora_checkin)
    && visitAlreadyCompleted !== true;
}

function validateVisitExecution(request, nextStatus, actorRole) {
  if (!['Em Atendimento', 'Concluída'].includes(nextStatus)) return null;
  if (actorRole === 'gestor') return null;
  if (request?.aprovacao_cliente === 'aprovado') return null;
  if (isVisitReleasedForExecution(request)) return null;
  return 'A visita ainda não foi autorizada. Envie o orçamento e aguarde a aprovação do cliente antes de iniciar o atendimento.';
}

module.exports = { canManagerCompleteStartedVisit, isVisitReleasedForExecution, validateVisitExecution };
