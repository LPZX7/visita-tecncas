const express = require('express');
const db = require('../lib/db');
const { verifyToken, requireRole } = require('../lib/auth');
const { sendMail, actionEmailHtml } = require('../lib/mailer');
const { signApprovalToken } = require('../lib/approvalToken');
const { generateBudgetPdf } = require('../lib/budgetPdf');
const { calculateBudgetTotal } = require('../lib/pricing');
const { pushVisitaTecnicaAprovadaToMilvus } = require('../lib/milvusSync');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5183';

function validateVisitaTecnicaFields({ items, motivo_troca, deslocamento }) {
  if (!items || items.length === 0) return 'Selecione ao menos uma peça que será trocada';
  for (const item of items) {
    if (!item.quantidade || Number(item.quantidade) <= 0) return 'Informe a quantidade da peça';
    if (item.valor_unitario === undefined || item.valor_unitario === null || Number(item.valor_unitario) < 0) {
      return 'Informe o valor unitário da peça';
    }
  }
  if (!motivo_troca || !String(motivo_troca).trim()) return 'Informe o motivo da troca';
  if (deslocamento === undefined || deslocamento === null || Number(deslocamento) < 0) return 'Informe o valor da visita técnica';
  return null;
}

const router = express.Router();
router.use(verifyToken);

router.get('/', async (req, res, next) => {
  try {
    const budgets = await db.getBudgets();
    if (req.user.role === 'cliente') {
      const allRequests = await db.getRequests();
      return res.json(budgets.filter((budget) => {
        const request = allRequests.find((req) => req.id === budget.request_id);
        return request && request.empresa_id === req.user.empresa_id;
      }));
    }
    res.json(budgets);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/pdf', async (req, res, next) => {
  try {
    const budget = await db.getBudgetById(req.params.id);
    if (!budget) {
      return res.status(404).json({ error: 'Orçamento não encontrado' });
    }
    const request = await db.getRequestById(budget.request_id);
    if (req.user.role === 'cliente' && (!request || request.empresa_id !== req.user.empresa_id)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const company = request ? await db.getCompanyById(budget.empresa_id || request.empresa_id) : null;
    const unit = budget.unidade_id ? await db.getUnitById(budget.unidade_id) : null;
    const items = await Promise.all(budget.items.map(async (item) => ({
      nome: (await db.getPartById(item.peca_id))?.nome || 'Peça',
      quantidade: item.quantidade,
      valor_unitario: item.valor_unitario
    })));

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="orcamento.pdf"');

    const doc = generateBudgetPdf({ budget, request, company, unit, items });
    doc.pipe(res);
    doc.end();
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('tecnico', 'analista', 'gestor'), async (req, res, next) => {
  try {
    const { request_id, empresa_id, unidade_id, items = [], deslocamento = 0, motivo_troca, observacoes_tecnicas } = req.body;
    const draft_by = req.user.sub;
    if (!request_id || !empresa_id) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }

    const request = await db.getRequestById(request_id);
    if (!request) {
      return res.status(400).json({ error: 'Solicitação inválida' });
    }
    if (request.empresa_id !== empresa_id) {
      return res.status(400).json({ error: 'A empresa do orçamento não corresponde à solicitação' });
    }
    if (req.user.role === 'tecnico' && request.assigned_technician !== req.user.sub) {
      return res.status(403).json({ error: 'Você não está atribuído a esta solicitação' });
    }
    if (unidade_id) {
      const unit = await db.getUnitById(unidade_id);
      if (!unit || unit.empresa_id !== request.empresa_id) {
        return res.status(400).json({ error: 'Filial/sede inválida para esta solicitação' });
      }
    }
    const uniquePartIds = new Set();
    for (const item of items) {
      if (uniquePartIds.has(item.peca_id)) {
        return res.status(400).json({ error: 'A mesma peça não pode aparecer mais de uma vez' });
      }
      uniquePartIds.add(item.peca_id);
      if (!item.peca_id || !(await db.getPartById(item.peca_id))) {
        return res.status(400).json({ error: 'Uma das peças selecionadas é inválida' });
      }
    }

    const validationError = validateVisitaTecnicaFields({ items, motivo_troca, deslocamento });
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const { pecasTotal: partsTotal, deslocamentoTotal, total } = calculateBudgetTotal({ items, deslocamento });

    const budget = {
      request_id,
      draft_by,
      empresa_id,
      unidade_id: unidade_id || null,
      base_total: 0,
      pecas_total: partsTotal,
      mao_obra_total: 0,
      total,
      status: 'Rascunho',
      deslocamento: deslocamentoTotal,
      urgencia: 0,
      horas_trabalho: 0,
      motivo_troca: String(motivo_troca).trim(),
      observacoes_tecnicas: (observacoes_tecnicas || '').trim() || null
    };

    const created = await db.createBudget(budget, items);
    await db.logAudit({
      user: req.user,
      acao: 'orcamento_criado',
      entidade: 'budget',
      entidade_id: created.id,
      detalhes: `Orçamento (rascunho) criado — R$ ${Number(created.total).toFixed(2)}`
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

const BUDGET_STATUSES = ['Rascunho', 'Enviado', 'Aprovado', 'Rejeitado'];

router.patch('/:id/status', async (req, res, next) => {
  try {
    const budget = await db.getBudgetById(req.params.id);
    if (!budget) {
      return res.status(404).json({ error: 'Orçamento não encontrado' });
    }

    const { status } = req.body;
    if (!BUDGET_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }

    if (req.user.role === 'cliente') {
      const request = (await db.getRequests()).find((item) => item.id === budget.request_id);
      if (!request || request.empresa_id !== req.user.empresa_id) {
        return res.status(403).json({ error: 'Acesso negado' });
      }
      if (budget.status !== 'Enviado' || !['Aprovado', 'Rejeitado'].includes(status)) {
        return res.status(400).json({ error: 'Transição de status não permitida' });
      }
      if (status === 'Aprovado') {
        const { nome, cpf, telefone } = req.body;
        if (!nome || !String(nome).trim()) {
          return res.status(400).json({ error: 'Informe o nome de quem está autorizando o orçamento' });
        }
        if (!cpf || !String(cpf).trim()) {
          return res.status(400).json({ error: 'Informe o CPF de quem está autorizando o orçamento' });
        }
        if (!telefone || !String(telefone).trim()) {
          return res.status(400).json({ error: 'Informe o telefone de quem está autorizando o orçamento' });
        }
      }
    } else if (['tecnico', 'analista', 'gestor'].includes(req.user.role)) {
      // A equipe só pode enviar o orçamento para o cliente — a aprovação/rejeição
      // exige uma ação explícita do próprio cliente (portal ou link de email).
      if (budget.status !== 'Rascunho' || status !== 'Enviado') {
        return res.status(400).json({ error: 'Somente o cliente pode autorizar ou recusar esta visita técnica. A equipe pode apenas enviar o orçamento para aprovação.' });
      }
      const validationError = validateVisitaTecnicaFields(budget);
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }
    } else {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const patch = { status };
    if (status === 'Aprovado') {
      patch.autorizado_por = 'Cliente via portal (usuário logado)';
      patch.aprovacao_nome = String(req.body.nome).trim();
      patch.aprovacao_cpf = String(req.body.cpf).trim();
      patch.aprovacao_telefone = String(req.body.telefone).trim();
    }
    const updated = await db.updateBudget(budget.id, patch);
    await db.logAudit({
      user: req.user,
      acao: `orcamento_${status.toLowerCase()}`,
      entidade: 'budget',
      entidade_id: updated.id,
      detalhes: `Orçamento de R$ ${updated.total.toFixed(2)} — status alterado para ${status}`
    });

    const request = (await db.getRequests()).find((item) => item.id === updated.request_id);

    if (status === 'Enviado' && request) {
      const company = await db.getCompanyById(request.empresa_id);
      const emailDestino = request.solicitante_email || company?.email;
      if (emailDestino) {
        const token = signApprovalToken(updated.id);
        const link = `${FRONTEND_URL}/aprovar-orcamento/${token}`;
        sendMail({
          to: emailDestino,
          subject: 'Novo orçamento disponível para aprovação',
          text: `Um orçamento no valor de R$ ${updated.total.toFixed(2)} está disponível para sua aprovação.\n\nVeja os detalhes e faça login na sua conta para aprovar ou rejeitar:\n${link}\n\nEste link expira em 14 dias.`,
          html: actionEmailHtml({
            title: 'Orçamento disponível para aprovação',
            message: `Um orçamento no valor de <strong>R$ ${updated.total.toFixed(2)}</strong> está disponível para sua aprovação. Veja os detalhes e faça login na sua conta para aprovar ou rejeitar.`,
            buttonLabel: 'Ver orçamento',
            buttonUrl: link,
            footnote: 'Este link expira em 14 dias.'
          })
        });
      }
      await db.createNotification({
        empresa_id: request.empresa_id,
        titulo: 'Novo orçamento para aprovação',
        mensagem: `R$ ${updated.total.toFixed(2)} aguardando sua aprovação`,
        link: '/budgets'
      });
    } else if (status === 'Aprovado') {
      const contract = await db.createContractForBudget(updated);

      const companyForMilvus = request ? await db.getCompanyById(request.empresa_id) : null;
      const itemsForMilvus = await Promise.all((updated.items || []).map(async (item) => ({
        nome: (await db.getPartById(item.peca_id))?.nome || 'Peça',
        quantidade: item.quantidade,
        valor_unitario: item.valor_unitario
      })));
      pushVisitaTecnicaAprovadaToMilvus(updated, request, companyForMilvus, itemsForMilvus, {
        email: companyForMilvus?.email,
        contato: companyForMilvus?.responsavel
      });

      const draftUser = await db.getUserById(updated.draft_by);
      if (draftUser?.email) {
        sendMail({
          to: draftUser.email,
          subject: 'Orçamento aprovado pelo cliente',
          text: `O orçamento de R$ ${updated.total.toFixed(2)} que você enviou foi aprovado pelo cliente.\n\nContrato gerado automaticamente: ${contract.numero}\nDisponível no portal em Contratos.`
        });
      }

      const company = request ? await db.getCompanyById(request.empresa_id) : null;
      const emailContrato = request?.solicitante_email || company?.email;
      if (emailContrato) {
        sendMail({
          to: emailContrato,
          subject: `Contrato ${contract.numero} gerado`,
          text: `Seu orçamento foi aprovado e o contrato ${contract.numero} foi gerado automaticamente.\n\nVocê pode acessá-lo e baixar o PDF pelo portal Mirontec, na seção Contratos.`
        });
      }
      if (request) {
        await db.createNotification({
          empresa_id: request.empresa_id,
          titulo: 'Orçamento aprovado',
          mensagem: `Contrato ${contract.numero} gerado automaticamente`,
          link: '/contracts'
        });
      }
    } else if (status === 'Rejeitado') {
      const draftUser = await db.getUserById(updated.draft_by);
      if (draftUser?.email) {
        sendMail({
          to: draftUser.email,
          subject: 'Orçamento rejeitado pelo cliente',
          text: `O orçamento de R$ ${updated.total.toFixed(2)} que você enviou foi rejeitado pelo cliente.`
        });
      }
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('gestor'), async (req, res, next) => {
  try {
    const existing = await db.getBudgetById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Orçamento não encontrado' });
    }
    const result = await db.deleteBudget(req.params.id);
    if (result.blocked) {
      return res.status(409).json({ error: 'Não é possível excluir: existe um contrato vinculado a este orçamento — exclua o contrato primeiro' });
    }
    await db.logAudit({
      user: req.user,
      acao: 'orcamento_excluido',
      entidade: 'budget',
      entidade_id: req.params.id,
      detalhes: `Orçamento de R$ ${Number(existing.total).toFixed(2)} — status ${existing.status}`
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
