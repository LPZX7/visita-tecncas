const db = require('./db');

const API_URL = 'https://apinewintegracao.bomcontrole.com.br/integracao/ProdutoServico/Pesquisar';
const PAGE_SIZE = 100;

let lastSync = { status: 'idle', syncedAt: null, total: 0, created: 0, updated: 0, error: null };

function normalizeProduct(item) {
  const externalId = Number(item.Id);
  if (!Number.isFinite(externalId) || !String(item.Nome || '').trim()) return null;
  const stock = Number(item.Quantidade || 0);
  const price = Number(item.Valor || 0);
  return {
    bomcontrole_id: externalId,
    codigo: `BC-${externalId}`,
    nome: String(item.Nome).trim(),
    categoria: 'BomControle',
    preco_unitario: Number.isFinite(price) && price >= 0 ? price : 0,
    estoque: Number.isFinite(stock) ? Math.max(0, Math.trunc(stock)) : 0,
    fornecedor: null
  };
}

async function fetchPage(apiKey, page) {
  const params = new URLSearchParams({
    'request.produto': 'true',
    'request.servico': 'false',
    'request.paginacao.itensPorPagina': String(PAGE_SIZE),
    'request.paginacao.numeroDaPagina': String(page)
  });
  const response = await fetch(`${API_URL}?${params}`, {
    headers: { Authorization: `ApiKey ${apiKey}` },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) {
    let detail = '';
    try {
      const errorBody = await response.json();
      detail = errorBody.Mensagem || errorBody.mensagem || errorBody.Titulo || '';
    } catch {
      // Respostas sem JSON usam a mensagem HTTP genérica abaixo.
    }
    throw new Error(detail || `BomControle respondeu HTTP ${response.status}`);
  }
  const data = await response.json();
  const items = Array.isArray(data) ? data : (data.Itens || data.itens || []);
  const total = Number(data.TotalItens ?? data.totalItens ?? items.length);
  return { items, total };
}

async function fetchAllProducts(apiKey) {
  const products = [];
  let page = 1;
  let total = Infinity;
  while (products.length < total) {
    const result = await fetchPage(apiKey, page);
    products.push(...result.items);
    total = result.total;
    if (result.items.length < PAGE_SIZE || result.items.length === 0) break;
    page += 1;
  }
  return products;
}

async function syncBomControleParts() {
  const apiKey = process.env.BOMCONTROLE_API_KEY;
  if (!apiKey) throw new Error('BOMCONTROLE_API_KEY não configurada');
  lastSync = { ...lastSync, status: 'running', error: null };
  try {
    const rawProducts = await fetchAllProducts(apiKey);
    const products = rawProducts.map(normalizeProduct).filter(Boolean);
    let created = 0;
    let updated = 0;
    for (const product of products) {
      const result = await db.upsertBomControlePart(product);
      if (result.created) created += 1;
      else updated += 1;
    }
    lastSync = { status: 'success', syncedAt: new Date().toISOString(), total: products.length, created, updated, error: null };
    return lastSync;
  } catch (err) {
    lastSync = { ...lastSync, status: 'error', error: err.message };
    throw err;
  }
}

function getBomControleSyncStatus() {
  return { ...lastSync, configured: Boolean(process.env.BOMCONTROLE_API_KEY) };
}

module.exports = { normalizeProduct, fetchAllProducts, syncBomControleParts, getBomControleSyncStatus };
