const COMMON_CORRECTIONS = [
  [/\bnao\b/gi, 'não'],
  [/\bpeca\b/gi, 'peça'],
  [/\bpecas\b/gi, 'peças'],
  [/\btecnico\b/gi, 'técnico'],
  [/\btecnica\b/gi, 'técnica'],
  [/\bmanutencao\b/gi, 'manutenção'],
  [/\balimentacao\b/gi, 'alimentação'],
  [/\bsubstituicao\b/gi, 'substituição'],
  [/\bobservacao\b/gi, 'observação'],
  [/\bapos\b/gi, 'após'],
  [/\beletronica\b/gi, 'eletrônica'],
  [/\boptico\b/gi, 'óptico']
];

function normalizeSpaces(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sentence(value) {
  let text = normalizeSpaces(value);
  if (!text) return '';
  for (const [pattern, replacement] of COMMON_CORRECTIONS) text = text.replace(pattern, replacement);
  text = text.replace(/\bfoi queimada\b/gi, 'estava queimada');
  text = text.replace(/\s+([,.;!?])/g, '$1').replace(/([,;!?])(?=[^\s\n\d])/g, '$1 ');
  text = text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1);
  if (!/[.!?]$/.test(text)) text += '.';
  return text;
}

function comparisonKey(value) {
  return normalizeSpaces(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((word) => !['a', 'o', 'as', 'os', 'um', 'uma'].includes(word))
    .join(' ');
}

function isRepeated(value, previousValues = []) {
  const key = comparisonKey(value);
  if (!key) return true;
  return previousValues.some((previous) => {
    const previousKey = comparisonKey(previous);
    return previousKey && (previousKey === key || (key.length >= 18 && previousKey.includes(key)) || (previousKey.length >= 18 && key.includes(previousKey)));
  });
}

function money(value) {
  return Number(value || 0)
    .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    .replace(/\u00a0/g, ' ');
}

function quantity(value) {
  const parsed = Number(value || 0);
  return Number.isInteger(parsed) ? parsed : parsed.toLocaleString('pt-BR');
}

function lowerInitial(value) {
  const text = normalizeSpaces(value);
  if (!text || /^[A-Z0-9]{2,}(?:\b|\d)/.test(text)) return text;
  return text.charAt(0).toLocaleLowerCase('pt-BR') + text.slice(1);
}

function partWithQuantity(item) {
  const amount = Number(item.quantidade || 0);
  const unit = amount === 1 ? 'unidade' : 'unidades';
  return `${item.nome} — ${quantity(amount)} ${unit}`;
}

function partInSentence(item) {
  const amount = Number(item.quantidade || 0);
  const unit = amount === 1 ? 'unidade' : 'unidades';
  return `${quantity(amount)} ${unit} de ${lowerInitial(item.nome)}`;
}

function joinNatural(values = []) {
  const filtered = values.filter(Boolean);
  if (filtered.length <= 1) return filtered[0] || '';
  return `${filtered.slice(0, -1).join(', ')} e ${filtered.at(-1)}`;
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('day')}/${get('month')}/${get('year')} às ${get('hour')}:${get('minute')}`;
}

function section(title, content) {
  const values = (Array.isArray(content) ? content : [content]).filter(Boolean);
  return values.length ? `${title}\n\n${values.join('\n')}` : '';
}

function composeSections(sections) {
  return sections.filter(Boolean).join('\n\n');
}

module.exports = {
  composeSections,
  formatDateTime,
  isRepeated,
  joinNatural,
  lowerInitial,
  money,
  normalizeSpaces,
  partInSentence,
  partWithQuantity,
  section,
  sentence
};
