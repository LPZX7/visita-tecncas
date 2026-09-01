function validateTechnicalVisitBudget({ items = [], deslocamento } = {}) {
  const normalizedItems = Array.isArray(items) ? items : [];

  for (const item of normalizedItems) {
    const quantity = Number(item.quantidade);
    const unitValue = Number(item.valor_unitario);
    if (!Number.isInteger(quantity) || quantity <= 0) return 'Informe a quantidade da peça';
    if (item.valor_unitario === undefined || item.valor_unitario === null || !Number.isFinite(unitValue) || unitValue < 0) {
      return 'Informe o valor unitário da peça';
    }
  }

  const visitValue = Number(deslocamento);
  if (deslocamento === undefined || deslocamento === null || deslocamento === '' || !Number.isFinite(visitValue) || visitValue < 0) {
    return 'Informe o valor da visita técnica';
  }

  if (normalizedItems.length === 0 && visitValue <= 0) {
    return 'Para um orçamento sem peças, informe um valor maior que zero para a visita técnica';
  }

  return null;
}

module.exports = { validateTechnicalVisitBudget };
