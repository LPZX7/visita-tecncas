const db = require('./db');
const { listarChamadosVisitaTecnica, buscarClientePorDocumento, criarChamado } = require('./milvus');

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

async function pushChamadoToMilvus(request, company, opts = {}) {
  if (!process.env.MILVUS_API_TOKEN) return;
  if (!company?.cnpj) {
    console.warn(`[milvus] Empresa "${company?.razao_social}" sem CNPJ — não foi possível espelhar o chamado #${request.numero} no Milvus`);
    return;
  }

  try {
    let clienteToken = company.milvus_cliente_token;
    if (!clienteToken) {
      const cliente = await buscarClientePorDocumento(company.cnpj);
      if (!cliente) {
        console.warn(`[milvus] Cliente com CNPJ ${company.cnpj} (${company.razao_social}) não encontrado no Milvus — chamado #${request.numero} não foi espelhado`);
        return;
      }
      clienteToken = cliente.token;
      await db.updateCompany(company.id, { milvus_cliente_token: clienteToken });
    }

    const codigo = await criarChamado({
      clienteToken,
      assunto: `Chamado #${request.numero} — ${request.descricao}`.slice(0, 180),
      descricao: `Aberto via sistema Mirontec.\n\nDescrição: ${request.descricao}\nUrgência: ${request.urgencia}\nEndereço: ${request.endereco || 'não informado'}`,
      email: opts.email,
      telefone: opts.telefone,
      contato: opts.contato
    });

    if (codigo) {
      await db.updateRequest(request.id, { milvus_codigo: codigo });
      console.log(`[milvus] Chamado #${request.numero} espelhado no Milvus como ticket #${codigo}`);
    }
  } catch (err) {
    console.error(`[milvus] Falha ao espelhar chamado #${request.numero} no Milvus:`, err.message);
  }
}

module.exports = { syncMilvusChamados, pushChamadoToMilvus };
