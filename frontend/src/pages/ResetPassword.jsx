import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api';
import AuthLayout from '../components/AuthLayout';

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ senha: '', confirmarSenha: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

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

    setSubmitting(true);
    try {
      const res = await api.post('/auth/reset-password', { token, senha: form.senha });
      setSuccess(res.data.message);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao redefinir senha.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <h1 id="auth-title" className="login-card__headline">Redefinir senha</h1>
      <p className="login-card__lead">Escolha uma nova senha para sua conta.</p>

      {error && <div className="alert alert-error">{error}</div>}
      {success && (
        <div className="alert alert-error" style={{ background: 'rgba(30,142,90,0.1)', color: 'var(--verde)', border: '1px solid rgba(30,142,90,0.25)' }}>
          {success} Redirecionando para o login…
        </div>
      )}

      {!success && (
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="new-senha">Nova senha</label>
            <input
              id="new-senha"
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
            <label htmlFor="confirm-new-senha">Confirmar nova senha</label>
            <input
              id="confirm-new-senha"
              className="form-input"
              type="password"
              value={form.confirmarSenha}
              onChange={(e) => setForm({ ...form, confirmarSenha: e.target.value })}
              placeholder="Repita a nova senha"
              required
              minLength={8}
            />
          </div>

          <button type="submit" className="signin-button" disabled={submitting}>
            Redefinir senha
          </button>
        </form>
      )}

      <p className="login-signup-hint">
        <Link to="/login" className="inline-link">Voltar para login</Link>
      </p>
    </AuthLayout>
  );
}
