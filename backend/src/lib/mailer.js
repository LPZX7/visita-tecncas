const nodemailer = require('nodemailer');

const {
  RESEND_API_KEY, RESEND_FROM, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, FRONTEND_URL,
  GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_SENDER
} = process.env;

const from = SMTP_FROM || RESEND_FROM || 'onboarding@resend.dev';
const LOGO_URL = `${FRONTEND_URL || 'https://visitas-tecnicas.onrender.com'}/mirontec-logo.jpg`;
const PORTAL_URL = FRONTEND_URL || 'https://visitas-tecnicas.onrender.com';
const SUPPORT_PHONE_DISPLAY = process.env.MIRONTEC_SUPPORT_PHONE || '(11) 99748-8664';
const SUPPORT_PHONE_DIGITS = String(process.env.MIRONTEC_SUPPORT_PHONE_DIGITS || '5511997488664').replace(/\D/g, '');

const ROLE_LABELS = {
  analista: 'Analista de Suporte',
  tecnico: 'Técnico de Campo',
  gestor: 'Gestão de Atendimento'
};

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
}

function buildEmailSignature(user = null) {
  const name = String(user?.milvus_nome || user?.nome || 'Equipe Mirontec').trim();
  const role = ROLE_LABELS[user?.role] || 'Atendimento Técnico';
  const email = String(user?.milvus_email || user?.email || '').trim().toLowerCase();
  const safeName = escapeHtml(name);
  const safeRole = escapeHtml(role);
  const safeEmail = escapeHtml(email);
  const emailLine = email ? `\n${email}` : '';
  const emailHtml = email
    ? `<a href="mailto:${safeEmail}" style="color:#475569;text-decoration:none;">${safeEmail}</a><span style="color:#cbd5e1;margin:0 7px;">•</span>`
    : '';

  return {
    text: `Atenciosamente,\n\n${name}\n${role} | Mirontec${emailLine}\n${SUPPORT_PHONE_DISPLAY}\n${PORTAL_URL}`,
    html: `
      <div data-mirontec-signature="true" style="background:#f1f5f9;padding:0 16px 28px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
        <div style="max-width:480px;margin:0 auto;padding:18px 22px;border-top:3px solid #2563eb;border-radius:0 0 14px 14px;background:#ffffff;box-shadow:0 8px 22px rgba(15,23,42,.06);">
          <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="width:52px;padding-right:14px;vertical-align:middle;">
                <img src="${LOGO_URL}" alt="Mirontec" width="48" height="48" style="display:block;border-radius:10px;" />
              </td>
              <td style="vertical-align:middle;border-left:1px solid #e2e8f0;padding-left:14px;">
                <strong style="display:block;color:#0f172a;font-size:15px;line-height:1.35;">${safeName}</strong>
                <span style="display:block;margin:2px 0 7px;color:#2563eb;font-size:12px;font-weight:700;">${safeRole} · Mirontec</span>
                <span style="display:block;color:#64748b;font-size:11px;line-height:1.5;">
                  ${emailHtml}<a href="https://wa.me/${SUPPORT_PHONE_DIGITS}" style="color:#475569;text-decoration:none;">${escapeHtml(SUPPORT_PHONE_DISPLAY)}</a>
                </span>
              </td>
            </tr>
          </table>
        </div>
      </div>`
  };
}

function appendEmailSignature({ text, html, signatureUser }) {
  const signature = buildEmailSignature(signatureUser);
  const signedText = String(text || '').includes('Atenciosamente,')
    ? text
    : `${text || ''}\n\n${signature.text}`.trim();
  const signedHtml = html && !String(html).includes('data-mirontec-signature')
    ? `${html}${signature.html}`
    : html;
  return { text: signedText, html: signedHtml };
}

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

let gmailAccessToken = null;
let gmailAccessTokenExpiry = 0;

async function getGmailAccessToken() {
  if (gmailAccessToken && Date.now() < gmailAccessTokenExpiry) return gmailAccessToken;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      refresh_token: GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token'
    })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Falha ao renovar token do Gmail (${res.status}): ${JSON.stringify(data)}`);
  }

  gmailAccessToken = data.access_token;
  gmailAccessTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return gmailAccessToken;
}

function base64Url(str) {
  return Buffer.from(str, 'utf-8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sendViaGmailApi({ to, subject, text, html }) {
  try {
    const accessToken = await getGmailAccessToken();
    const encodedSubject = `=?utf-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`;
    const message = [
      `From: Mirontec Service <${GMAIL_SENDER}>`,
      `To: ${to}`,
      `Subject: ${encodedSubject}`,
      'MIME-Version: 1.0',
      `Content-Type: ${html ? 'text/html' : 'text/plain'}; charset=utf-8`,
      '',
      html || text || ''
    ].join('\r\n');

    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw: base64Url(message) })
    });

    const data = await res.json();
    if (!res.ok) {
      console.error(`[mailer] Falha ao enviar email via Gmail (${res.status}):`, JSON.stringify(data));
      return false;
    }
    console.log(`[mailer] Email enviado via Gmail — id: ${data.id}`);
    return true;
  } catch (err) {
    console.error('[mailer] Falha ao enviar email via Gmail:', err.message);
    return false;
  }
}

async function sendViaSmtp({ to, subject, text, html }) {
  try {
    const info = await smtpTransport.sendMail({ from, to, subject, text, ...(html ? { html } : {}) });
    console.log(`[mailer] Email enviado via SMTP — id: ${info.messageId}`);
    return true;
  } catch (err) {
    console.error('[mailer] Falha ao enviar email via SMTP:', err.message);
    return false;
  }
}

async function sendViaResend({ to, subject, text, html }) {
  if (!RESEND_API_KEY) {
    console.warn(`[mailer] Nenhum provedor de email configurado — email não enviado: "${subject}" para ${to}`);
    return false;
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
      return false;
    }
    console.log(`[mailer] Email aceito pelo Resend — id: ${data.id}`);
    return true;
  } catch (err) {
    console.error('[mailer] Falha ao enviar email:', err.message);
    return false;
  }
}

async function sendMail({ to, subject, text, html, signatureUser, includeSignature = true }) {
  if (!to) return false;

  const content = includeSignature
    ? appendEmailSignature({ text, html, signatureUser })
    : { text, html };

  if (GMAIL_CLIENT_ID && GMAIL_CLIENT_SECRET && GMAIL_REFRESH_TOKEN && GMAIL_SENDER) {
    return sendViaGmailApi({ to, subject, ...content });
  }
  if (smtpTransport) {
    return sendViaSmtp({ to, subject, ...content });
  }
  return sendViaResend({ to, subject, ...content });
}

module.exports = { sendMail, actionEmailHtml, buildEmailSignature, appendEmailSignature };
