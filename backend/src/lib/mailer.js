const nodemailer = require('nodemailer');

const { GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;

const transporter = GMAIL_USER && GMAIL_APP_PASSWORD
  ? nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      family: 4,
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD }
    })
  : null;

async function sendMail({ to, subject, text }) {
  if (!to) return;

  if (!transporter) {
    console.warn(`[mailer] GMAIL_USER/GMAIL_APP_PASSWORD não configurados — email não enviado: "${subject}" para ${to}`);
    return;
  }

  try {
    await transporter.sendMail({ from: GMAIL_USER, to, subject, text });
  } catch (err) {
    console.error('[mailer] Falha ao enviar email:', err.message);
  }
}

module.exports = { sendMail };
