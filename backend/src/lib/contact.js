function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
  const email = normalizeEmail(value);
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function resolveContactEmail({ provided, request, unit, company, user } = {}) {
  const candidates = [provided, request?.solicitante_email, unit?.email, company?.email, user?.email];
  return candidates.map(normalizeEmail).find(isValidEmail) || '';
}

module.exports = { normalizeEmail, isValidEmail, resolveContactEmail };
