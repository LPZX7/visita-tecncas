import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api';
import { setAuth } from '../utils/auth';
import AuthLayout from '../components/AuthLayout';

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' });
  const params = new URLSearchParams(window.location.search);
  const expired = params.get('expired') === '1';
  const redirectTo = params.get('redirect');
  const [error, setError] = useState(expired ? 'Sua sessão expirou. Faça login novamente.' : '');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await api.post('/auth/login', form);
      setAuth(res.data.token, res.data.user, remember);
      navigate(redirectTo && redirectTo.startsWith('/') ? redirectTo : '/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao fazer login. Verifique seu email e senha.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <h1 id="auth-title" className="login-card__headline">Bem-vindo ao Mirontec Service</h1>
      <p className="login-card__lead">Informe seus dados para acessar o portal.</p>

      {error && <div className="alert alert-error" role="alert" aria-live="polite">{error}</div>}

      <form className="login-form" onSubmit={handleSubmit}>
        <div className="form-field input-with-icon">
          <label htmlFor="email">E-mail</label>
          <svg className="input-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path fill="#94a3b8" d="M2 6.5A2.5 2.5 0 014.5 4h15A2.5 2.5 0 0122 6.5v11a2.5 2.5 0 01-2.5 2.5h-15A2.5 2.5 0 012 17.5v-11zM20 7l-8 5L4 7" />
          </svg>
          <input
            id="email"
            className="form-input"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="seuemail@empresa.com.br"
            required
          />
        </div>

        <div className="form-field input-with-icon">
          <label htmlFor="password">Senha</label>
          <svg className="input-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path fill="#94a3b8" d="M12 1a5 5 0 00-5 5v3H5a2 2 0 00-2 2v6a2 2 0 002 2h14a2 2 0 002-2v-6a2 2 0 00-2-2h-2V6a5 5 0 00-5-5z" />
          </svg>
          <input
            id="password"
            className="form-input"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="Sua senha"
            required
          />
          <button type="button" className="password-toggle" aria-label="Mostrar senha" onClick={() => setShowPassword(!showPassword)}>
            {showPassword ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.5 5.4A10.6 10.6 0 0112 5c5 0 9 4 10 7-.4 1.1-1.1 2.3-2.1 3.4M6.6 6.6C4.6 8 3.1 10 2 12c1 3 5 7 10 7 1.3 0 2.6-.3 3.8-.7" stroke="#64748b" strokeWidth="1.6" strokeLinecap="round" /></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" stroke="#64748b" strokeWidth="1.6" /><circle cx="12" cy="12" r="3" stroke="#64748b" strokeWidth="1.6" /></svg>
            )}
          </button>
        </div>

        <div className="login-actions">
          <label className="login-actions__remember">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> <span>Lembrar meu acesso</span>
          </label>
          <Link to="/esqueci-senha" className="inline-link">Esqueci minha senha?</Link>
        </div>

        <button type="submit" className="signin-button" disabled={submitting} aria-busy={submitting}>
          {submitting ? 'Entrando...' : 'Entrar no sistema'}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 10 }}>
            <path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>

      <p className="login-signup-hint">
        Ainda não tem conta? <Link to="/cadastro" className="inline-link">Cadastre-se agora</Link>
      </p>
    </AuthLayout>
  );
}
