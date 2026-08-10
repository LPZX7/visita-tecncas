const express = require('express');
const db = require('../lib/db');
const { verifyToken, requireRole } = require('../lib/auth');
const { sendMail, actionEmailHtml } = require('../lib/mailer');
const { signApprovalToken } = require('../lib/approvalToken');
const { generateBudgetPdf } = require('../lib/budgetPdf');
const { calculateBudgetTotal } = require('../lib/pricing');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5183';

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
    const { request_id, empresa_id, unidade_id, items = [], deslocamento = 0 } = req.body;
    const draft_by = req.user.sub;
    if (!request_id || !empresa_id) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }

    const request = (await db.getRequests()).find((req) => req.id === request_id);
    if (!request) {
      return res.status(400).json({ error: 'Solicitação inválida' });
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
      horas_trabalho: 0
    };

    const created = await db.createBudget(budget, items);
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
    } else if (['tecnico', 'analista', 'gestor'].includes(req.user.role)) {
      if (budget.status === 'Rascunho' && status !== 'Enviado') {
        return res.status(400).json({ error: 'Transição de status não permitida' });
      }
      if (budget.status !== 'Rascunho' && !['Aprovado', 'Rejeitado', 'Enviado'].includes(status)) {
        return res.status(400).json({ error: 'Transição de status não permitida' });
      }
    } else {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const updated = await db.updateBudget(budget.id, { status });
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
      if (company?.email) {
        const token = signApprovalToken(updated.id);
        const link = `${FRONTEND_URL}/aprovar-orcamento/${token}`;
        sendMail({
          to: company.email,
          subject: 'Novo orçamento disponível para aprovação',
          text: `Um orçamento no valor de R$ ${updated.total.toFixed(2)} está disponível para sua aprovação.\n\nVeja os detalhes e aprove ou rejeite diretamente, sem precisar fazer login:\n${link}\n\nEste link expira em 14 dias.`,
          html: actionEmailHtml({
            title: 'Orçamento disponível para aprovação',
            message: `Um orçamento no valor de <strong>R$ ${updated.total.toFixed(2)}</strong> está disponível para sua aprovação. Veja os detalhes e aprove ou rejeite diretamente, sem precisar fazer login.`,
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

      const draftUser = await db.getUserById(updated.draft_by);
      if (draftUser?.email) {
        sendMail({
          to: draftUser.email,
          subject: 'Orçamento aprovado pelo cliente',
          text: `O orçamento de R$ ${updated.total.toFixed(2)} que você enviou foi aprovado pelo cliente.\n\nContrato gerado automaticamente: ${contract.numero}\nDisponível no portal em Contratos.`
        });
      }

      const company = request ? await db.getCompanyById(request.empresa_id) : null;
      if (company?.email) {
        sendMail({
          to: company.email,
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

module.exports = router;
