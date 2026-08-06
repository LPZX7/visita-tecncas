const { RESEND_API_KEY, RESEND_FROM } = process.env;

const from = RESEND_FROM || 'onboarding@resend.dev';

async function sendMail({ to, subject, text }) {
  if (!to) return;

  if (!RESEND_API_KEY) {
    console.warn(`[mailer] RESEND_API_KEY não configurada — email não enviado: "${subject}" para ${to}`);
    return;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from, to, subject, text })
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

module.exports = { sendMail };
