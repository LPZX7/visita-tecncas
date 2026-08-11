const BASE_URL = 'https://apiintegracao.milvus.com.br/api';
const CATEGORIA_VISITA_TECNICA = 'Visita Tecnica Mirontec';

function getToken() {
  return process.env.MILVUS_API_TOKEN;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function listarChamadosVisitaTecnica() {
  const token = getToken();
  if (!token) {
    console.warn('[milvus] MILVUS_API_TOKEN não configurado — sincronização ignorada');
    return [];
  }

  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}/chamado/listagem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({
          filtro_body: { categoria_secundaria: CATEGORIA_VISITA_TECNICA, status: 'Todos' },
          total_registros: 200
        })
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Milvus listagem falhou (${res.status}): ${text.slice(0, 200)}`);
      }

      const data = await res.json();
      return data.lista || [];
    } catch (err) {
      lastErr = err;
      if (attempt < 3) await sleep(2000 * attempt);
    }
  }
  throw lastErr;
}

const CATEGORIA_ID_VISITA_TECNICA = 689813;
const CATEGORIA_PRIMARIA_VISITA_TECNICA = 'Catraca';

function onlyDigits(str) {
  return (str || '').replace(/\D/g, '');
}

async function buscarClientePorDocumento(cnpjCpf) {
  const token = getToken();
  if (!token || !cnpjCpf) return null;

  const documento = onlyDigits(cnpjCpf);
  const res = await fetch(`${BASE_URL}/cliente/busca?documento=${documento}&status=3`, {
    headers: { Authorization: token }
  });

  if (!res.ok) return null;
  const data = await res.json();
  return (data.lista && data.lista[0]) || null;
}

async function criarChamado({ clienteToken, assunto, descricao, email, telefone, contato }) {
  const token = getToken();
  if (!token) return null;

  const res = await fetch(`${BASE_URL}/chamado/criar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify({
      cliente_id: clienteToken,
      chamado_assunto: assunto,
      chamado_descricao: descricao,
      chamado_email: email || 'contato@mirontec.com.br',
      chamado_telefone: telefone || '',
      chamado_contato: contato || 'Sistema Mirontec',
      chamado_categoria_primaria: CATEGORIA_PRIMARIA_VISITA_TECNICA,
      chamado_categoria_secundaria: CATEGORIA_VISITA_TECNICA,
      categoria_id: CATEGORIA_ID_VISITA_TECNICA
    })
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Milvus criarChamado falhou (${res.status}): ${text.slice(0, 200)}`);
  }
  return text.trim().replace(/^"|"$/g, '');
}

async function criarAcompanhamento({ ticketCodigo, descricao, privado = false }) {
  const token = getToken();
  if (!token || !ticketCodigo) return;

  const res = await fetch(`${BASE_URL}/chamado/acompanhamento/criar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify({
      acompanhamento_ticket: String(ticketCodigo),
      acompanhamento_descricao: descricao,
      acompanhamento_privado: privado
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Milvus criarAcompanhamento falhou (${res.status}): ${text.slice(0, 200)}`);
  }
}

async function finalizarChamado({ ticketCodigo, servicoRealizado }) {
  const token = getToken();
  if (!token || !ticketCodigo) return;

  const res = await fetch(`${BASE_URL}/chamado/finalizar`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify({
      chamado_codigo: String(ticketCodigo),
      chamado_servico_realizado: servicoRealizado || ''
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Milvus finalizarChamado falhou (${res.status}): ${text.slice(0, 200)}`);
  }
}

module.exports = { listarChamadosVisitaTecnica, buscarClientePorDocumento, criarChamado, criarAcompanhamento, finalizarChamado, CATEGORIA_VISITA_TECNICA };
