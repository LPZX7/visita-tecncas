import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import AuthLayout from '../components/AuthLayout';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await api.post('/auth/forgot-password', { email });
      setMessage(res.data.message);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao solicitar redefinição de senha.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <Link to="/login" className="auth-back-link">← Voltar para login</Link>

      <h1 id="auth-title" className="login-card__headline">Esqueci minha senha</h1>
      <p className="login-card__lead">Informe seu email e enviaremos um link para redefinir sua senha.</p>

      {error && <div className="alert alert-error">{error}</div>}
      {message && (
        <div className="alert alert-error" style={{ background: 'rgba(30,142,90,0.1)', color: 'var(--verde)', border: '1px solid rgba(30,142,90,0.25)' }}>
          {message}
        </div>
      )}

      {!message && (
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="forgot-email">E-mail</label>
            <input
              id="forgot-email"
              className="form-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seuemail@empresa.com.br"
              required
            />
          </div>

          <button type="submit" className="signin-button" disabled={submitting}>
            Enviar link de redefinição
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
