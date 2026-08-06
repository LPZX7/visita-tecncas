const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../lib/db');
const { signToken, comparePassword, hashPassword } = require('../lib/auth');
const { requireRole, verifyToken } = require('../lib/auth');
const { signResetToken, verifyResetToken } = require('../lib/resetToken');
const { sendMail, actionEmailHtml } = require('../lib/mailer');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5183';

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Tente novamente em alguns minutos.' }
});

const accountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente novamente em alguns minutos.' }
});

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await db.findUserByEmail(email);
    if (!user || !user.ativo) {
      return res.status(401).json({ error: 'Usuário ou senha incorretos' });
    }

    const valid = await comparePassword(password, user.senha_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Usuário ou senha incorretos' });
    }

    const token = signToken(user);
    res.json({ token, user: { id: user.id, nome: user.nome, email: user.email, role: user.role, empresa_id: user.empresa_id } });
  } catch (err) {
    next(err);
  }
});

router.get('/me', verifyToken, async (req, res, next) => {
  try {
    const user = await db.getUserById(req.user.sub);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    res.json({ id: user.id, nome: user.nome, email: user.email, role: user.role, empresa_id: user.empresa_id, ativo: user.ativo });
  } catch (err) {
    next(err);
  }
});

router.post('/register', verifyToken, requireRole('gestor', 'analista'), async (req, res, next) => {
  try {
    const { nome, email, senha, role, empresa_id, ativo = true } = req.body;
    if (!nome || !email || !senha || !role) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }

    if (req.user.role === 'analista' && role !== 'cliente') {
      return res.status(403).json({ error: 'Analistas só podem cadastrar usuários do tipo Cliente. Peça a um gestor para cadastrar técnicos, analistas ou gestores.' });
    }

    if (await db.findUserByEmail(email)) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }

    const senha_hash = await hashPassword(senha);
    const user = await db.createUser({ nome, email, senha_hash, role, empresa_id: empresa_id || null, ativo });
    const { senha_hash: _omit, ...safeUser } = user;
    res.status(201).json(safeUser);
  } catch (err) {
    next(err);
  }
});

router.post('/signup', accountLimiter, async (req, res, next) => {
  try {
    const { nome, email, senha } = req.body;
    if (!nome || !email || !senha) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }
    if (senha.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres' });
    }
    if (await db.findUserByEmail(email)) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }

    const senha_hash = await hashPassword(senha);
    const user = await db.createUser({ nome, email, senha_hash, role: 'cliente', empresa_id: null, ativo: true });

    const token = signToken(user);
    res.status(201).json({ token, user: { id: user.id, nome: user.nome, email: user.email, role: user.role, empresa_id: user.empresa_id } });
  } catch (err) {
    next(err);
  }
});

router.post('/forgot-password', accountLimiter, async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await db.findUserByEmail(email || '');

    if (user?.ativo) {
      const token = signResetToken(user.id, user.senha_hash);
      const link = `${FRONTEND_URL}/redefinir-senha/${token}`;
      sendMail({
        to: user.email,
        subject: 'Redefinição de senha — Mirontec',
        text: `Olá,\n\nRecebemos um pedido para redefinir sua senha. Acesse o link abaixo para criar uma nova senha:\n${link}\n\nEste link expira em 1 hora. Se você não pediu isso, ignore este email.`,
        html: actionEmailHtml({
          title: 'Redefinir sua senha',
          message: 'Recebemos um pedido para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha.',
          buttonLabel: 'Redefinir senha',
          buttonUrl: link,
          footnote: 'Este link expira em 1 hora. Se você não pediu isso, pode ignorar este email com segurança.'
        })
      });
    }

    res.json({ message: 'Se este email estiver cadastrado, enviamos um link de redefinição de senha.' });
  } catch (err) {
    next(err);
  }
});

router.post('/reset-password', accountLimiter, async (req, res, next) => {
  try {
    const { token, senha } = req.body;
    if (!token || !senha) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }
    if (senha.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres' });
    }

    let payload;
    try {
      payload = verifyResetToken(token);
    } catch {
      return res.status(400).json({ error: 'Link inválido ou expirado' });
    }

    const user = await db.getUserById(payload.userId);
    if (!user || user.senha_hash.slice(-12) !== payload.hashFingerprint) {
      return res.status(400).json({ error: 'Este link já foi usado ou expirou. Solicite um novo.' });
    }

    const senha_hash = await hashPassword(senha);
    await db.updateUser(user.id, { senha_hash });
    res.json({ message: 'Senha redefinida com sucesso. Você já pode fazer login.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
