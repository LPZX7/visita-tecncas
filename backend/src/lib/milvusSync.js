const db = require('./db');
const { listarChamadosVisitaTecnica, buscarClientePorDocumento, criarChamado, criarAcompanhamento, finalizarChamado } = require('./milvus');
const { buildMilvusPayload } = require('./visitaTecnicaFormat');

function isTicketVisitaTecnica(ticket) {
  const texto = `${ticket.assunto || ''} ${ticket.categoria_secundaria || ''} ${ticket.categoria_primaria || ''}`;
  return /visita/i.test(texto);
}

async function syncMilvusChamados() {
  const lista = await listarChamadosVisitaTecnica();
  if (!lista.length) return { encontrados: 0, novos: 0 };

  const codigos = lista.map((t) => String(t.codigo));
  const existentes = new Set(await db.getMilvusPendentesByCodigos(codigos));

  let novos = 0;
  for (const ticket of lista) {
    const codigo = String(ticket.codigo);
    if (existentes.has(codigo)) continue;
    if (!isTicketVisitaTecnica(ticket)) continue;

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

async function pushVisitaTecnicaAprovadaToMilvus(budget, request, company, items, opts = {}) {
  if (!process.env.MILVUS_API_TOKEN) return;
  if (!company?.cnpj) {
    console.warn(`[milvus] Empresa "${company?.razao_social}" sem CNPJ — não foi possível enviar a visita técnica aprovada (orçamento #${budget.id}) ao Milvus`);
    return;
  }

  try {
    let clienteToken = company.milvus_cliente_token;
    if (!clienteToken) {
      const cliente = await buscarClientePorDocumento(company.cnpj);
      if (!cliente) {
        console.warn(`[milvus] Cliente com CNPJ ${company.cnpj} (${company.razao_social}) não encontrado no Milvus — visita técnica (orçamento #${budget.id}) não foi enviada`);
        return;
      }
      clienteToken = cliente.token;
      await db.updateCompany(company.id, { milvus_cliente_token: clienteToken });
    }

    const { assunto, descricao } = buildMilvusPayload({ budget, items, request });

    const codigo = await criarChamado({
      clienteToken,
      assunto,
      descricao,
      email: opts.email,
      telefone: opts.telefone,
      contato: opts.contato
    });

    if (codigo) {
      await db.updateBudget(budget.id, { milvus_codigo: codigo });
      console.log(`[milvus] Visita técnica aprovada (orçamento #${budget.id}) enviada ao Milvus como ticket #${codigo}`);
    }
  } catch (err) {
    console.error(`[milvus] Falha ao enviar visita técnica aprovada (orçamento #${budget.id}) ao Milvus:`, err.message);
  }
}

// Depois que a visita técnica já foi aprovada e criada no Milvus (budget com
// milvus_codigo), mantém aquele mesmo ticket atualizado conforme o
// atendimento avança — check-in, check-out e conclusão. Não faz nada se o
// chamado ainda não tiver orçamento aprovado com ticket no Milvus.
async function syncRequestUpdateToMilvus(request, { tipo, technician }) {
  if (!process.env.MILVUS_API_TOKEN) return;

  try {
    const budgets = await db.getBudgets();
    const aprovado = budgets.find((b) => b.request_id === request.id && b.status === 'Aprovado' && b.milvus_codigo);
    if (!aprovado) return;

    if (tipo === 'checkin') {
      await criarAcompanhamento({
        ticketCodigo: aprovado.milvus_codigo,
        descricao: `Check-in realizado${technician ? ` pelo técnico ${technician}` : ''} em ${new Date(request.hora_checkin).toLocaleString('pt-BR')}.`
      });
      console.log(`[milvus] Check-in do chamado #${request.numero} sincronizado com o ticket #${aprovado.milvus_codigo}`);
    } else if (tipo === 'concluida') {
      const relatorio = request.relatorio_visita || 'Sem relatório informado.';
      await criarAcompanhamento({
        ticketCodigo: aprovado.milvus_codigo,
        descricao: `Check-out em ${new Date(request.hora_checkout).toLocaleString('pt-BR')}.\n\nRelatório da visita: ${relatorio}`
      });
      await finalizarChamado({ ticketCodigo: aprovado.milvus_codigo, servicoRealizado: relatorio });
      console.log(`[milvus] Conclusão do chamado #${request.numero} sincronizada com o ticket #${aprovado.milvus_codigo}`);
    }
  } catch (err) {
    console.error(`[milvus] Falha ao sincronizar atualização do chamado #${request.numero}:`, err.message);
  }
}

module.exports = { syncMilvusChamados, pushChamadoToMilvus, pushVisitaTecnicaAprovadaToMilvus, syncRequestUpdateToMilvus };
