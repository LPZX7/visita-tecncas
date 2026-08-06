const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

function signResetToken(userId, senhaHash) {
  return jwt.sign(
    { userId, hashFingerprint: senhaHash.slice(-12), purpose: 'password-reset' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function verifyResetToken(token) {
  const payload = jwt.verify(token, JWT_SECRET);
  if (payload.purpose !== 'password-reset' || !payload.userId) {
    throw new Error('Token inválido');
  }
  return payload;
}

module.exports = { signResetToken, verifyResetToken };
