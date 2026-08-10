const db = require('./db');
const { listarChamadosVisitaTecnica } = require('./milvus');

async function syncMilvusChamados() {
  const lista = await listarChamadosVisitaTecnica();
  if (!lista.length) return { encontrados: 0, novos: 0 };

  const codigos = lista.map((t) => String(t.codigo));
  const existentes = new Set(await db.getMilvusPendentesByCodigos(codigos));

  let novos = 0;
  for (const ticket of lista) {
    const codigo = String(ticket.codigo);
    if (existentes.has(codigo)) continue;

    await db.createMilvusPendente({
      milvus_codigo: codigo,
      milvus_id: ticket.id ? String(ticket.id) : null,
      assunto: ticket.assunto || null,
      descricao: ticket.descricao || ticket.descricao_html || null,
      cliente_nome: ticket.cliente || ticket.contato || null,
      cliente_email: ticket.email_conferencia || null,
      cliente_telefone: ticket.telefone || null,
      cliente_contato: ticket.contato || null,
      raw_json: JSON.stringify(ticket)
    });
    novos++;
  }

  return { encontrados: lista.length, novos };
}

module.exports = { syncMilvusChamados };
