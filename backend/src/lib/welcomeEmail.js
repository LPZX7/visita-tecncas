const { actionEmailHtml, sendMail } = require('./mailer');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5183';

const ROLE_LABELS = {
  cliente: 'Cliente',
  tecnico: 'Técnico de Campo',
  analista: 'Analista de Suporte',
  gestor: 'Gestor'
};

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
}

function buildWelcomeEmail(user) {
  const name = String(user?.nome || 'Cliente').trim();
  const firstName = name.split(/\s+/)[0] || 'Cliente';
  const role = ROLE_LABELS[user?.role] || 'Usuário';
  const loginUrl = `${FRONTEND_URL}/login`;

  return {
    subject: 'Bem-vindo ao Mirontec Service',
    text: [
      `Olá, ${firstName}!`,
      '',
      'Sua conta no Mirontec Service foi criada com sucesso.',
      `Perfil de acesso: ${role}.`,
      '',
      'No portal você pode acompanhar chamados, visitas, orçamentos e documentos em um só lugar.',
      `Acesse sua conta: ${loginUrl}`,
      '',
      'Por segurança, sua senha nunca é enviada por e-mail. Se você não reconhece este cadastro, entre em contato com a Mirontec.'
    ].join('\n'),
    html: actionEmailHtml({
      title: `Bem-vindo, ${escapeHtml(firstName)}!`,
      message: `Sua conta no <strong>Mirontec Service</strong> foi criada com sucesso.<br><br><strong>Perfil de acesso:</strong> ${escapeHtml(role)}.<br><br>No portal você pode acompanhar chamados, visitas, orçamentos e documentos em um só lugar.`,
      buttonLabel: 'Acessar minha conta',
      buttonUrl: loginUrl,
      footnote: 'Por segurança, sua senha nunca é enviada por e-mail. Se você não reconhece este cadastro, entre em contato com a Mirontec.'
    })
  };
}

async function sendWelcomeEmail(user, signatureUser = null) {
  if (!user?.email) return false;
  return sendMail({
    to: user.email,
    ...buildWelcomeEmail(user),
    signatureUser
  });
}

module.exports = { buildWelcomeEmail, sendWelcomeEmail };
