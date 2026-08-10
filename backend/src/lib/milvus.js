const BASE_URL = 'https://apiintegracao.milvus.com.br/api';
const CATEGORIA_VISITA_TECNICA = 'VISITA TECNICA';

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

module.exports = { listarChamadosVisitaTecnica, CATEGORIA_VISITA_TECNICA };
