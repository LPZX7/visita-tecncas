const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

function signApprovalToken(budgetId) {
  return jwt.sign({ budgetId, purpose: 'budget-approval' }, JWT_SECRET, { expiresIn: '14d' });
}

function verifyApprovalToken(token) {
  const payload = jwt.verify(token, JWT_SECRET);
  if (payload.purpose !== 'budget-approval' || !payload.budgetId) {
    throw new Error('Token inválido');
  }
  return payload;
}

function signVisitApprovalToken(requestId) {
  return jwt.sign({ requestId, purpose: 'visit-approval' }, JWT_SECRET, { expiresIn: '14d' });
}

function verifyVisitApprovalToken(token) {
  const payload = jwt.verify(token, JWT_SECRET);
  if (payload.purpose !== 'visit-approval' || !payload.requestId) {
    throw new Error('Token inválido');
  }
  return payload;
}

module.exports = { signApprovalToken, verifyApprovalToken, signVisitApprovalToken, verifyVisitApprovalToken };
