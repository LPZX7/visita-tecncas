import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';
import { getUser } from '../utils/auth';

function formatDateTime(value) {
  if (!value) return null;
  return new Date(value).toLocaleString('pt-BR');
}

export default function ApproveVisit() {
  const { token } = useParams();
  const user = getUser();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/public/visitas/${token}`)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Não foi possível carregar esta visita.'))
      .finally(() => setLoading(false));
  }, [token]);

  const loginLink = `/login?redirect=${encodeURIComponent('/budgets')}`;

  return (
    <div className="standalone-page">
      <main className="standalone-card fade-in">
        <div className="login-card__brand">
          <img src="/mirontec-logo.jpg" alt="Mirontec" className="brand-logo" onError={(e) => { e.target.src = '/mirontec-logo.svg'; }} />
          <div>
            <strong>Mirontec Service</strong>
            <span>Orçamento e visita técnica</span>
          </div>
        </div>

        {loading && <p className="section-text">Carregando…</p>}
        {!loading && error && <div className="alert alert-error">{error}</div>}

        {!loading && data && (
          <>
            <h1 className="login-card__headline">Chamado #{data.numero}</h1>
            <p className="login-card__lead">{data.empresa}{data.unidade ? ` — ${data.unidade}` : ''}</p>

            <div className="detail-panel" style={{ marginBottom: 20 }}>
              <div className="detail-grid">
                <div>
                  <strong>Descrição</strong>
                  <p>{data.descricao}</p>
                </div>
                {data.equipamento && (
                  <div>
                    <strong>Equipamento</strong>
                    <p>{data.equipamento}</p>
                  </div>
                )}
                <div>
                  <strong>Urgência</strong>
                  <p>{data.urgencia}</p>
                </div>
                {data.endereco && (
                  <div>
                    <strong>Endereço</strong>
                    <p>{data.endereco}</p>
                  </div>
                )}
                {formatDateTime(data.agendado_para) && (
                  <div>
                    <strong>Data prevista</strong>
                    <p>{formatDateTime(data.agendado_para)}</p>
                  </div>
                )}
              </div>
            </div>

            {data.aprovacao_cliente === 'aprovado' ? (
              <div className="alert alert-success">O orçamento foi aprovado e esta visita já está autorizada.</div>
            ) : (
              <div className="detail-report" style={{ marginBottom: 20 }}>
                <strong>A autorização agora acontece pelo orçamento</strong>
                <p>O cliente só autoriza a visita depois que o orçamento é enviado. Ao aprovar o orçamento, a visita também é autorizada automaticamente.</p>
              </div>
            )}

            {user ? (
              <Link to="/budgets" className="btn btn-primary">Ver orçamentos</Link>
            ) : (
              <Link to={loginLink} className="btn btn-primary">Fazer login para ver o orçamento</Link>
            )}
          </>
        )}

        <p className="login-footer">© 2026 Mirontec. Todos os direitos reservados.</p>
      </main>
    </div>
  );
}
