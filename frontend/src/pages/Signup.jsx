import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api';
import { setAuth } from '../utils/auth';
import AuthLayout from '../components/AuthLayout';

export default function Signup() {
  const [form, setForm] = useState({ nome: '', email: '', senha: '', confirmarSenha: '' });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.senha.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres.');
      return;
    }
    if (form.senha !== form.confirmarSenha) {
      setError('As senhas não conferem.');
      return;
    }

    try {
      const res = await api.post('/auth/signup', { nome: form.nome, email: form.email, senha: form.senha });
      setAuth(res.data.token, res.data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao criar sua conta.');
    }
  };

  return (
    <AuthLayout>
      <Link to="/login" className="auth-back-link">← Voltar para login</Link>

      <h1 id="auth-title" className="login-card__headline">Criar sua conta</h1>
      <p className="login-card__lead">Cadastre-se para acompanhar seus chamados e orçamentos.</p>

      {error && <div className="alert alert-error">{error}</div>}

      <form className="login-form" onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="nome">Nome completo</label>
          <input
            id="nome"
            className="form-input"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            placeholder="Seu nome"
            required
          />
        </div>

        <div className="form-field">
          <label htmlFor="signup-email">E-mail</label>
          <input
            id="signup-email"
            className="form-input"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="seuemail@empresa.com.br"
            required
          />
        </div>

        <div className="form-field">
          <label htmlFor="signup-senha">Senha</label>
          <input
            id="signup-senha"
            className="form-input"
            type="password"
            value={form.senha}
            onChange={(e) => setForm({ ...form, senha: e.target.value })}
            placeholder="Mínimo 6 caracteres"
            required
            minLength={8}
          />
        </div>

        <div className="form-field">
          <label htmlFor="confirmar-senha">Confirmar senha</label>
          <input
            id="confirmar-senha"
            className="form-input"
            type="password"
            value={form.confirmarSenha}
            onChange={(e) => setForm({ ...form, confirmarSenha: e.target.value })}
            placeholder="Repita a senha"
            required
            minLength={8}
          />
        </div>

        <button type="submit" className="signin-button">
          Cadastre-se agora
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 10 }}>
            <path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>

      <p className="login-signup-hint">
        Já tem conta? <Link to="/login" className="inline-link">Entrar</Link>
      </p>
    </AuthLayout>
  );
}
