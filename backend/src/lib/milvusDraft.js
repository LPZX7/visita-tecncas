const PART_ALIASES = {
  'CATR-BRACO': ['braço', 'braços', 'haste da catraca', 'hastes da catraca'],
  'CATR-TECLADO': ['teclado', 'teclados'],
  'CATR-PLACA': ['placa', 'placas', 'placa principal'],
  'CATR-FONTE': ['fonte', 'fontes'],
  'CATR-BRACO-INOX': ['braço inox', 'braço de inox', 'braços de inox'],
  'CATR-BRACO-PONTA': ['ponteira', 'ponteiras', 'ponteira do braço'],
  'CATR-CUBO': ['cubo central', 'cubo do mecanismo'],
  'CATR-MOLA': ['mola', 'molas', 'mola de retorno'],
  'CATR-TRAVA': ['trava mecânica', 'travas mecânicas'],
  'CATR-SOLENOIDE-12V': ['solenoide', 'solenoides', 'solenoide 12v'],
  'CATR-AMORTECEDOR': ['amortecedor', 'amortecedores'],
  'CATR-ROLAMENTO': ['rolamento', 'rolamentos'],
  'CATR-SENSOR-GIRO': ['sensor de giro', 'sensor de passagem'],
  'CATR-SENSOR-OPTICO': ['sensor óptico', 'sensor optico', 'sensores ópticos'],
  'CATR-PLACA-CONTROLE': ['placa controladora', 'placa de controle'],
  'CATR-LEITOR-PROX': ['leitor de proximidade', 'leitor rfid'],
  'CATR-LEITOR-BIO': ['leitor biométrico', 'leitor biometrico'],
  'CATR-DISPLAY': ['display', 'displays'],
  'CATR-PICTOGRAMA': ['pictograma', 'pictogramas'],
  'CATR-TAMPA': ['tampa superior', 'tampa da catraca'],
  'CATR-CHICOTE': ['chicote elétrico', 'chicote eletrico', 'chicote interno'],
  'CATR-FUSIVEL': ['fusível', 'fusivel', 'fusíveis'],
  'CATR-BATERIA': ['bateria', 'baterias'],
  'CATR-FECHADURA': ['fechadura', 'fechaduras']
};

const GENERIC_EQUIPMENT_WORDS = new Set(['catraca', 'equipamento', 'sistema', 'maquina', 'maquininha', 'totem']);

function cleanMilvusText(value) {
  return String(value || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeText(value) {
  return cleanMilvusText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function parseRawTicket(pendente) {
  try {
    return JSON.parse(pendente?.raw_json || '{}');
  } catch {
    return {};
  }
}

function rawValue(raw, keys) {
  for (const key of keys) {
    if (raw?.[key] !== undefined && raw[key] !== null && String(raw[key]).trim()) return String(raw[key]).trim();
  }
  return '';
}

function ticketText(pendente) {
  return cleanMilvusText([pendente?.assunto, pendente?.descricao].filter(Boolean).join('\n'));
}

function splitEmails(value) {
  return String(value || '').toLowerCase().split(/[;,\s]+/).map((item) => item.trim()).filter((item) => item.includes('@'));
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function quantityNear(text, start, end) {
  const before = text.slice(Math.max(0, start - 28), start);
  const after = text.slice(end, Math.min(text.length, end + 28));
  const beforeMatch = before.match(/(?:^|\s)(\d{1,3})\s*(?:x|un|unidade|unidades|qtd|quantidade)?\s*$/);
  const afterMatch = after.match(/^\s*(?:x|qtd|quantidade)\s*(\d{1,3})(?:\s|$)/);
  const quantity = Number(beforeMatch?.[1] || afterMatch?.[1] || 1);
  return Number.isInteger(quantity) && quantity > 0 ? quantity : 1;
}

function aliasesForPart(part) {
  const code = String(part?.codigo || '').trim().toUpperCase();
  const aliases = [part?.nome, part?.codigo, ...(PART_ALIASES[code] || [])]
    .map(normalizeText)
    .filter((item) => item.length >= 3);
  return [...new Set(aliases)];
}

function detectPartsFromText(value, parts = []) {
  const text = normalizeText(value);
  if (!text) return [];
  const candidates = [];

  for (const part of parts) {
    const normalizedName = normalizeText(part.nome);
    const normalizedCode = normalizeText(part.codigo);
    for (const alias of aliasesForPart(part)) {
      const pattern = new RegExp(`(?:^|\\s)(${escapeRegex(alias).replace(/\\ /g, '\\s+')})(?=\\s|$)`, 'g');
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const start = match.index + match[0].length - match[1].length;
        const end = start + match[1].length;
        const exactBonus = alias === normalizedCode ? 140 : (alias === normalizedName ? 110 : 80);
        candidates.push({ part, alias, start, end, score: exactBonus + alias.length });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.start - b.start);
  const selected = [];
  for (const candidate of candidates) {
    if (selected.some((item) => candidate.start < item.end && candidate.end > item.start)) continue;
    selected.push(candidate);
  }

  const grouped = new Map();
  for (const candidate of selected.sort((a, b) => a.start - b.start)) {
    const existing = grouped.get(candidate.part.id);
    const quantity = quantityNear(text, candidate.start, candidate.end);
    if (existing) {
      existing.quantidade += quantity;
      continue;
    }
    grouped.set(candidate.part.id, {
      part: candidate.part,
      quantidade: quantity,
      evidencia: candidate.alias,
      posicao: candidate.start
    });
  }

  return [...grouped.values()].sort((a, b) => a.posicao - b.posicao);
}

function extractReasonFromText(value) {
  const text = cleanMilvusText(value);
  if (!text) return null;
  const labeled = text.match(/(?:^|[\n.;])\s*(?:motivo(?:\s+da\s+troca)?|causa|diagn[oó]stico)\s*[:\-]\s*([^\n]{3,500})/i);
  if (labeled) {
    return labeled[1]
      .split(/\s+(?:peça|peca|serviço|servico|equipamento|observaç(?:ão|oes))\s*:/i)[0]
      .trim()
      .replace(/[.;,\s]+$/, '') || null;
  }

  const causal = text.match(/(?:troca|trocar|substitui(?:r|ção|cao))[^.!?\n]{0,160}?\s+(?:devido\s+a|por\s+causa\s+de|porque|pois)\s+([^.!?\n]{3,300})/i);
  return causal?.[1]?.trim().replace(/[;,\s]+$/, '') || null;
}

function analyzeMilvusBudget(pendente, parts = []) {
  const sourceText = ticketText(pendente);
  const detected = detectPartsFromText(sourceText, parts);
  return {
    items: detected.map(({ part, quantidade }) => ({
      peca_id: part.id,
      valor_unitario: Number(part.preco_unitario || 0),
      quantidade
    })),
    matchedParts: detected.map(({ part, quantidade, evidencia }) => ({ ...part, quantidade, evidencia })),
    motivo_troca: extractReasonFromText(sourceText),
    observacoes_tecnicas: sourceText || null
  };
}

function chooseUniqueBest(scored) {
  const ordered = [...scored.entries()]
    .map(([item, score]) => ({ item, score }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);
  if (!ordered.length || (ordered[1] && ordered[1].score === ordered[0].score)) return null;
  return ordered[0].item;
}

function matchCompanyFromTicket(pendente, companies = [], units = []) {
  const raw = parseRawTicket(pendente);
  const clientName = normalizeText(pendente?.cliente_nome || rawValue(raw, ['cliente', 'cliente_nome', 'razao_social']));
  const ticketEmails = new Set(splitEmails(pendente?.cliente_email || rawValue(raw, ['email_conferencia', 'cliente_email', 'email'])));
  const document = onlyDigits(rawValue(raw, ['cliente_documento', 'documento_cliente', 'cnpj', 'cpf_cnpj']));
  const clientToken = rawValue(raw, ['cliente_token', 'token_cliente', 'cliente_id']);
  const scored = new Map(companies.map((company) => [company, 0]));

  for (const company of companies) {
    let score = 0;
    if (clientToken && company.milvus_cliente_token && String(company.milvus_cliente_token) === clientToken) score += 120;
    if (document && onlyDigits(company.cnpj) === document) score += 110;
    if (ticketEmails.has(String(company.email || '').trim().toLowerCase())) score += 90;
    if (units.some((unit) => unit.empresa_id === company.id && splitEmails(unit.email).some((email) => ticketEmails.has(email)))) score += 85;
    const names = [normalizeText(company.razao_social), normalizeText(company.nome_fantasia)].filter(Boolean);
    if (clientName && names.some((name) => name === clientName)) score += 80;
    else if (clientName.length >= 4 && names.some((name) => name.includes(clientName) || clientName.includes(name))) score += 55;
    scored.set(company, score);
  }

  return chooseUniqueBest(scored);
}

function matchUnitFromTicket(pendente, company, units = []) {
  const candidates = units.filter((unit) => unit.empresa_id === company?.id && unit.status !== 'inativo');
  if (!candidates.length) return null;
  const raw = parseRawTicket(pendente);
  const text = normalizeText(`${pendente?.cliente_nome || ''} ${ticketText(pendente)} ${JSON.stringify(raw)}`);
  const emails = new Set(splitEmails(pendente?.cliente_email || rawValue(raw, ['email_conferencia', 'cliente_email', 'email'])));
  const rawUnitCode = normalizeText(rawValue(raw, ['unidade_codigo', 'codigo_unidade', 'filial', 'unidade']));
  const scored = new Map();

  for (const unit of candidates) {
    let score = 0;
    if (splitEmails(unit.email).some((email) => emails.has(email))) score += 100;
    if (rawUnitCode && [unit.codigo, unit.nome].map(normalizeText).includes(rawUnitCode)) score += 90;
    const name = normalizeText(unit.nome);
    if (name.length >= 3 && new RegExp(`(?:^|\\s)${escapeRegex(name)}(?=\\s|$)`).test(text)) score += 65;
    scored.set(unit, score);
  }

  const matched = chooseUniqueBest(scored);
  return matched || (candidates.length === 1 ? candidates[0] : null);
}

function modelWords(model) {
  return normalizeText(model).split(' ').filter((word) => word.length >= 3 && !GENERIC_EQUIPMENT_WORDS.has(word));
}

function matchEquipmentFromTicket(pendente, company, unit, equipments = []) {
  let candidates = equipments.filter((equipment) => equipment.empresa_id === company?.id);
  if (!candidates.length) return null;
  const raw = parseRawTicket(pendente);
  const text = normalizeText(`${ticketText(pendente)} ${JSON.stringify(raw)}`);
  const compactText = text.replace(/\s/g, '');
  const scored = new Map();

  for (const equipment of candidates) {
    let score = 0;
    const serial = normalizeText(equipment.numero_serie).replace(/\s/g, '');
    const model = normalizeText(equipment.modelo);
    if (serial.length >= 4 && compactText.includes(serial)) score += 150;
    if (model.length >= 4 && new RegExp(`(?:^|\\s)${escapeRegex(model)}(?=\\s|$)`).test(text)) score += 110;
    const words = modelWords(equipment.modelo);
    if (words.length && words.every((word) => text.split(' ').includes(word))) score += 70 + words.length;
    if (unit && equipment.unidade_id === unit.id) score += 25;
    scored.set(equipment, score);
  }

  const matched = chooseUniqueBest(scored);
  if (matched) return matched;
  if (unit) {
    const unitEquipments = candidates.filter((equipment) => equipment.unidade_id === unit.id);
    if (unitEquipments.length === 1) return unitEquipments[0];
  }
  return candidates.length === 1 ? candidates[0] : null;
}

function inferUrgency(pendente) {
  const raw = parseRawTicket(pendente);
  const source = normalizeText(`${rawValue(raw, ['urgencia', 'prioridade', 'sla_prioridade'])} ${pendente?.assunto || ''}`);
  if (/\b(urgente|critica|critico|emergencia)\b/.test(source)) return 'Urgente';
  if (/\b(alta|prioritario|prioritaria)\b/.test(source)) return 'Alta';
  return 'Normal';
}

function formatAddress(company, unit) {
  if (!unit) return company?.endereco || '';
  return [unit.endereco, unit.numero, unit.bairro, unit.cidade && unit.estado ? `${unit.cidade}/${unit.estado}` : unit.cidade]
    .filter(Boolean)
    .join(', ');
}

module.exports = {
  analyzeMilvusBudget,
  cleanMilvusText,
  detectPartsFromText,
  extractReasonFromText,
  formatAddress,
  inferUrgency,
  matchCompanyFromTicket,
  matchEquipmentFromTicket,
  matchUnitFromTicket,
  normalizeText,
  parseRawTicket,
  rawValue,
  ticketText
};
