function calculateBudgetTotal({ items = [], deslocamento = 0 }) {
  const pecasTotal = items.reduce((sum, item) => sum + item.valor_unitario * item.quantidade, 0);
  const deslocamentoTotal = Number(deslocamento) || 0;
  const total = pecasTotal + deslocamentoTotal;
  return { pecasTotal, deslocamentoTotal, total };
}

module.exports = { calculateBudgetTotal };
