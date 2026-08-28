const db = require('./db');
const { isValidEmail, normalizeEmail } = require('./contact');
const { actionEmailHtml, sendMail } = require('./mailer');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5183';

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
}

function recipientEmail(user) {
  const candidates = [user?.email, user?.milvus_email];
  return candidates.map(normalizeEmail).find(isValidEmail) || '';
}

function collectApprovalRecipients(users = [], assignedTechnicianId = null) {
  const managers = users.filter((user) => user?.ativo && user.role === 'gestor');
  const technician = assignedTechnicianId
    ? users.find((user) => user?.ativo && user.id === assignedTechnicianId)
    : null;
  const recipients = technician ? [...managers, technician] : managers;
  const seen = new Set();

  return recipients.flatMap((user) => {
    const email = recipientEmail(user);
    if (!email || seen.has(email)) return [];
    seen.add(email);
    return [{ ...user, notification_email: email }];
  });
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function buildApprovalEmail({ kind, request, company, budget, contract, technician }) {
  const budgetApproved = kind === 'budget';
  const clientName = company?.razao_social || company?.nome_fantasia || 'Cliente não informado';
  const approverName = budgetApproved ? budget?.aprovacao_nome : request?.aprovacao_nome;
  const portalUrl = `${FRONTEND_URL}/requests`;
  const title = budgetApproved ? 'Orçamento aprovado e visita autorizada' : 'Visita autorizada pelo cliente';
  const subject = budgetApproved
    ? `Orçamento e visita aprovados — chamado #${request?.numero || 'sem número'}`
    : `Visita autorizada — chamado #${request?.numero || 'sem número'}`;
  const statusLine = budgetApproved
    ? `Valor aprovado: ${formatMoney(budget?.total)}${contract?.numero ? `\nContrato: ${contract.numero}` : ''}`
    : 'Status: visita autorizada';
  const details = [
    `Cliente: ${clientName}`,
    `Chamado Mirontec: #${request?.numero || 'não informado'}`,
    `Chamado Milvus: #${request?.milvus_codigo || 'não informado'}`,
    `Descrição: ${request?.descricao || 'não informada'}`,
    `Técnico responsável: ${technician?.milvus_nome || technician?.nome || 'a definir'}`,
    `Aprovado por: ${approverName || 'cliente pelo portal'}`,
    statusLine
  ];
  const htmlDetails = [
    ['Cliente', clientName],
    ['Chamado Mirontec', `#${request?.numero || 'não informado'}`],
    ['Chamado Milvus', `#${request?.milvus_codigo || 'não informado'}`],
    ['Descrição', request?.descricao || 'não informada'],
    ['Técnico responsável', technician?.milvus_nome || technician?.nome || 'a definir'],
    ['Aprovado por', approverName || 'cliente pelo portal']
  ];
  if (budgetApproved) {
    htmlDetails.push(['Visita', 'Autorizada automaticamente']);
    htmlDetails.push(['Valor aprovado', formatMoney(budget?.total)]);
    if (contract?.numero) htmlDetails.push(['Contrato', contract.numero]);
  } else {
    htmlDetails.push(['Status', 'Visita autorizada']);
  }

  return {
    subject,
    text: `${title}.\n\n${details.join('\n')}\n\nAbrir chamado: ${portalUrl}`,
    html: actionEmailHtml({
      title,
      message: `A aprovação foi registrada com sucesso.<br><br>${htmlDetails
        .map(([label, value]) => `<strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}`)
        .join('<br>')}`,
      buttonLabel: 'Abrir chamado',
      buttonUrl: portalUrl,
      footnote: 'Mensagem automática enviada aos gestores e ao técnico responsável.'
    })
  };
}

async function sendApprovalNotificationToStaff({ kind, request, company, budget = null, contract = null, signatureUser = null }) {
  const users = await db.getUsers();
  const technician = request?.assigned_technician
    ? users.find((user) => user.id === request.assigned_technician) || null
    : null;
  const recipients = collectApprovalRecipients(users, request?.assigned_technician);
  const content = buildApprovalEmail({ kind, request, company, budget, contract, technician });
  const results = await Promise.all(recipients.map((recipient) => sendMail({
    to: recipient.notification_email,
    ...content,
    signatureUser: signatureUser || technician || null
  })));

  return {
    recipients: recipients.map((recipient) => recipient.notification_email),
    sent: results.filter(Boolean).length
  };
}

module.exports = {
  buildApprovalEmail,
  collectApprovalRecipients,
  sendApprovalNotificationToStaff
};
