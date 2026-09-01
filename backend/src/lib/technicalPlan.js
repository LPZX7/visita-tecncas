const { isRepeated, joinNatural, partInSentence, sentence } = require('./technicalWriting');

const EXECUTION_TERMS = /\b(trocar|troca|substituir|substitui[cç][aã]o|instalar|instala[cç][aã]o|mover|mudan[cç]a|realocar|reposicionar|configurar|configura[cç][aã]o|ajustar|ajuste|regular|reparar|reparo|corrigir|corre[cç][aã]o|testar|teste|verificar|inspecionar|manuten[cç][aã]o)\b/i;

function cleanInstruction(value) {
  return String(value || '')
    .replace(/^\s*(?:servi[cç]o|a[cç][aã]o|procedimento|solu[cç][aã]o|orienta[cç][aã]o)\s*[:\-]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractExplicitTasks(value) {
  const source = String(value || '').replace(/\r/g, '').trim();
  if (!source) return [];
  const candidates = source
    .split(/\n+|(?<=[.!?;])\s+/)
    .map(cleanInstruction)
    .filter((item) => item.length >= 4 && item.length <= 320 && EXECUTION_TERMS.test(item))
    .map((item, index) => ({
      item,
      index,
      score: /\b(trocar|substituir|instalar|mover|realocar|reposicionar|configurar|ajustar|regular|reparar|corrigir|testar|verificar|inspecionar)\b/i.test(item) ? 2 : 1
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item }) => item);
  const tasks = [];
  for (const candidate of candidates) {
    if (!isRepeated(candidate, tasks)) tasks.push(sentence(candidate));
  }
  return tasks.slice(0, 5);
}

function buildTechnicalPlan({ sourceText, request, budget, items = [] } = {}) {
  const source = sourceText || request?.descricao || budget?.observacoes_tecnicas || '';
  const explicitTasks = extractExplicitTasks(source);
  const partsDescription = items.length ? joinNatural(items.map(partInSentence)) : '';
  const replacementTask = partsDescription
    ? sentence(items.length === 1 ? `Substituir ${partsDescription} conforme o orçamento aprovado` : `Substituir ${partsDescription} conforme o orçamento aprovado`)
    : '';
  const objective = replacementTask || explicitTasks[0] || 'Realizar a visita técnica conforme a descrição do chamado.';
  const tasks = ['Confirmar o equipamento, o local e a orientação registrada no chamado antes de iniciar.'];

  if (replacementTask) tasks.push(replacementTask);
  for (const task of explicitTasks) {
    if (!isRepeated(task, [replacementTask, ...tasks])) tasks.push(task);
  }
  if (budget?.motivo_troca) tasks.push(sentence(`Validar no local a condição informada: ${budget.motivo_troca}`));
  tasks.push('Após o serviço, testar o funcionamento do equipamento e registrar o resultado no chamado.');

  return {
    objective,
    tasks,
    parts: items.map((item) => ({ nome: item.nome, quantidade: Number(item.quantidade || 0) })),
    reason: budget?.motivo_troca || null,
    explicitInstruction: explicitTasks.length > 0,
    source: 'Gerado automaticamente a partir do chamado Milvus e do orçamento aprovado.',
    warning: 'Orientação de execução: o técnico deve confirmar as condições no local e registrar qualquer divergência.'
  };
}

function buildTechnicalPlanText(plan) {
  if (!plan) return '';
  return [
    `Objetivo: ${plan.objective}`,
    ...plan.tasks.map((task, index) => `${index + 1}. ${task}`),
    plan.warning
  ].join('\n');
}

module.exports = { buildTechnicalPlan, buildTechnicalPlanText, extractExplicitTasks };
