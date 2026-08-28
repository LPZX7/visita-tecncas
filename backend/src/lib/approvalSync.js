function buildVisitApprovalPatchFromBudget(budget) {
  if (!budget || budget.status !== 'Aprovado') {
    throw new Error('Somente um orçamento aprovado pode autorizar a visita');
  }

  return {
    aprovacao_cliente: 'aprovado',
    data_aprovacao_cliente: budget.aprovado_em || new Date().toISOString(),
    aprovacao_nome: budget.aprovacao_nome || null,
    aprovacao_cpf: budget.aprovacao_cpf || null,
    aprovacao_telefone: budget.aprovacao_telefone || null
  };
}

module.exports = { buildVisitApprovalPatchFromBudget };
