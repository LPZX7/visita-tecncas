const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      empresa_id: user.empresa_id || null,
      name: user.nome,
      email: user.email
    },
    JWT_SECRET,
    {
      expiresIn: '8h'
    }
  );
}

function verifyToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  const token = auth.split(' ')[1];

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token inválido' });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    next();
  };
}

async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

async function comparePassword(raw, hashed) {
  return bcrypt.compare(raw, hashed);
}

module.exports = {
  signToken,
  verifyToken,
  requireRole,
  hashPassword,
  comparePassword
};
