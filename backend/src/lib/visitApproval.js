const { sendMail, actionEmailHtml } = require('./mailer');
const { signVisitApprovalToken } = require('./approvalToken');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5183';

function sendVisitApprovalEmail(request, company) {
  const to = request.solicitante_email || company?.email;
  if (!to) return;

  const token = signVisitApprovalToken(request.id);
  const link = `${FRONTEND_URL}/aprovar-visita/${token}`;

  sendMail({
    to,
    subject: `Autorização de visita técnica — Chamado #${request.numero}`,
    text: `Olá,\n\nUma visita técnica foi agendada para "${request.descricao}".\n\nPara autorizar a visita, acesse o link abaixo, sem precisar fazer login:\n${link}\n\nEste link expira em 14 dias.`,
    html: actionEmailHtml({
      title: 'Autorizar visita técnica',
      message: `Uma visita técnica foi agendada referente ao chamado <strong>#${request.numero}</strong>: "${request.descricao}". Clique no botão abaixo para autorizar (ou recusar) a visita, sem precisar fazer login.`,
      buttonLabel: 'Ver e autorizar visita',
      buttonUrl: link,
      footnote: 'Este link expira em 14 dias. Se você não reconhece esta solicitação, ignore este email.'
    })
  });
}

module.exports = { sendVisitApprovalEmail };
