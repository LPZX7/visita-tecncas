const express = require('express');
const db = require('../lib/db');
const { verifyToken, requireRole } = require('../lib/auth');
const { syncMilvusChamados } = require('../lib/milvusSync');
const { sendVisitApprovalEmail } = require('../lib/visitApproval');
const { calculateBudgetTotal } = require('../lib/pricing');

const TAXA_MOTORISTA = 100;

function normText(str) {
  return (str || '').toLowerCase().trim();
}

// Procura, no texto do ticket, peças já cadastradas no catálogo pelo nome
// (ex.: "troca do teclado e braço da catraca" bate com "Teclado" e "Braço
// da catraca", se existirem).
function matchPartsFromText(text, parts) {
  const texto = normText(text);
  if (!texto) return [];
  return parts.filter((part) => part.nome && texto.includes(normText(part.nome)));
}

const router = express.Router();
router.use(verifyToken);
router.use(requireRole('analista', 'gestor'));

router.get('/', async (req, res, next) => {
  try {
    const status = req.query.status || 'pendente';
    const pendentes = await db.getMilvusPendentes(status === 'todos' ? undefined : status);
    res.json(pendentes);
  } catch (err) {
    next(err);
  }
});

router.post('/sync', async (req, res, next) => {
  try {
    const result = await syncMilvusChamados();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/importar', async (req, res, next) => {
  try {
    const pendente = await db.getMilvusPendenteById(req.params.id);
    if (!pendente) {
      return res.status(404).json({ error: 'Ticket não encontrado' });
    }
    if (pendente.status !== 'pendente') {
      return res.status(409).json({ error: 'Este ticket já foi processado' });
    }

    const { empresa_id, equipamento_id, unidade_id, urgencia, endereco } = req.body;
    if (!empresa_id || !equipamento_id) {
      return res.status(400).json({ error: 'Selecione a empresa e o equipamento' });
    }

    const equipment = await db.getEquipmentById(equipamento_id);
    if (!equipment || equipment.empresa_id !== empresa_id) {
      return res.status(400).json({ error: 'Equipamento inválido para esta empresa' });
    }

    const descricao = [pendente.assunto, pendente.descricao].filter(Boolean).join(' — ') || `Chamado Milvus #${pendente.milvus_codigo}`;

    const request = await db.createRequest({
      empresa_id,
      equipamento_id,
      descricao,
      urgencia: urgencia || 'Normal',
      endereco: endereco || '',
      aberto_por: req.user.sub,
      solicitante_email: pendente.cliente_email || null
    });

    await db.updateMilvusPendente(pendente.id, { status: 'importado', request_id: request.id });

    const company = await db.getCompanyById(empresa_id);
    sendVisitApprovalEmail(request, company);

    await db.logAudit({
      user: req.user,
      acao: 'milvus_chamado_importado',
      entidade: 'request',
      entidade_id: request.id,
      detalhes: `Importado do Milvus (ticket #${pendente.milvus_codigo}) — ${descricao}`
    });

    // Já cria um rascunho de orçamento, identificando a(s) peça(s) pelo texto
    // do ticket — fica como Rascunho, precisa ser completado (motivo da
    // troca, valor da visita técnica) e enviado manualmente em Orçamentos.
    const allParts = await db.getParts();
    const matchedParts = matchPartsFromText(`${pendente.assunto || ''} ${pendente.descricao || ''}`, allParts);
    const items = matchedParts.map((part) => ({ peca_id: part.id, valor_unitario: part.preco_unitario, quantidade: 1 }));

    const unit = unidade_id ? await db.getUnitById(unidade_id) : null;
    const deslocamento = unit?.valor_deslocamento_padrao != null ? Number(unit.valor_deslocamento_padrao) + TAXA_MOTORISTA : 0;
    const { pecasTotal, deslocamentoTotal, total } = calculateBudgetTotal({ items, deslocamento });

    const budget = await db.createBudget({
      request_id: request.id,
      draft_by: req.user.sub,
      empresa_id,
      unidade_id: unidade_id || null,
      pecas_total: pecasTotal,
      total,
      deslocamento: deslocamentoTotal,
      motivo_troca: 'A definir',
      servico_realizado: pendente.descricao || pendente.assunto || 'A definir',
      observacoes_tecnicas: null
    }, items);

    await db.logAudit({
      user: req.user,
      acao: 'orcamento_criado_automatico',
      entidade: 'budget',
      entidade_id: budget.id,
      detalhes: `Rascunho criado automaticamente ao importar chamado #${request.numero} — ${items.length} peça(s) identificada(s): ${matchedParts.map((p) => p.nome).join(', ') || 'nenhuma'}`
    });

    res.status(201).json({ ...request, orcamento_id: budget.id, pecas_identificadas: matchedParts.map((p) => p.nome) });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/ignorar', async (req, res, next) => {
  try {
    const pendente = await db.getMilvusPendenteById(req.params.id);
    if (!pendente) {
      return res.status(404).json({ error: 'Ticket não encontrado' });
    }
    if (pendente.status !== 'pendente') {
      return res.status(409).json({ error: 'Este ticket já foi processado' });
    }
    const updated = await db.updateMilvusPendente(pendente.id, { status: 'ignorado' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
