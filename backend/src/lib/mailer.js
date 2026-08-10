const nodemailer = require('nodemailer');

const { RESEND_API_KEY, RESEND_FROM, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, FRONTEND_URL } = process.env;

const from = SMTP_FROM || RESEND_FROM || 'onboarding@resend.dev';
const LOGO_URL = `${FRONTEND_URL || 'https://visitas-tecnicas.onrender.com'}/mirontec-logo.jpg`;

let smtpTransport = null;
if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  smtpTransport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 465,
    secure: Number(SMTP_PORT) !== 587,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
}

function actionEmailHtml({ title, message, buttonLabel, buttonUrl, footnote }) {
  return `
  <div style="background:#f1f5f9;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
      <div style="background:#0f172a;padding:28px 32px;text-align:center;">
        <img src="${LOGO_URL}" alt="Mirontec" width="48" height="48" style="border-radius:10px;display:block;margin:0 auto 8px;" />
        <span style="color:#ffffff;font-size:16px;font-weight:600;letter-spacing:0.3px;">Mirontec Service</span>
      </div>
      <div style="padding:32px;">
        <h1 style="margin:0 0 12px;font-size:20px;color:#111827;">${title}</h1>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#475569;">${message}</p>
        <div style="text-align:center;margin:28px 0;">
          <a href="${buttonUrl}" style="background:#2563eb;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;display:inline-block;">${buttonLabel}</a>
        </div>
        ${footnote ? `<p style="margin:24px 0 0;font-size:13px;color:#94a3b8;text-align:center;">${footnote}</p>` : ''}
      </div>
    </div>
  </div>`;
}

async function sendViaSmtp({ to, subject, text, html }) {
  try {
    const info = await smtpTransport.sendMail({ from, to, subject, text, ...(html ? { html } : {}) });
    console.log(`[mailer] Email enviado via SMTP — id: ${info.messageId}`);
  } catch (err) {
    console.error('[mailer] Falha ao enviar email via SMTP:', err.message);
  }
}

async function sendViaResend({ to, subject, text, html }) {
  if (!RESEND_API_KEY) {
    console.warn(`[mailer] Nenhum provedor de email configurado — email não enviado: "${subject}" para ${to}`);
    return;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: RESEND_FROM || from, to, subject, text, ...(html ? { html } : {}) })
    });

    const data = await res.json();
    if (!res.ok) {
      console.error(`[mailer] Falha ao enviar email (${res.status}):`, JSON.stringify(data));
      return;
    }
    console.log(`[mailer] Email aceito pelo Resend — id: ${data.id}`);
  } catch (err) {
    console.error('[mailer] Falha ao enviar email:', err.message);
  }
}

async function sendMail({ to, subject, text, html }) {
  if (!to) return;

  if (smtpTransport) {
    return sendViaSmtp({ to, subject, text, html });
  }
  return sendViaResend({ to, subject, text, html });
}

module.exports = { sendMail, actionEmailHtml };
