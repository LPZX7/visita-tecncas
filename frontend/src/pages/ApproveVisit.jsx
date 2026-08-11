import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api';

function formatDateTime(value) {
  if (!value) return null;
  return new Date(value).toLocaleString('pt-BR');
}

export default function ApproveVisit() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.get(`/public/visitas/${token}`)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Não foi possível carregar esta visita.'))
      .finally(() => setLoading(false));
  }, [token]);

  const act = async (action) => {
    setSubmitting(true);
    setError('');
    try {
      const res = await api.post(`/public/visitas/${token}/${action}`);
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível registrar sua resposta.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="standalone-page">
      <main className="standalone-card fade-in">
        <div className="login-card__brand">
          <img src="/mirontec-logo.jpg" alt="Mirontec" className="brand-logo" onError={(e) => { e.target.src = '/mirontec-logo.svg'; }} />
          <div>
            <strong>Mirontec Service</strong>
            <span>Autorização de visita técnica</span>
          </div>
        </div>

        {loading && <p className="section-text">Carregando…</p>}

        {!loading && error && !result && (
          <div className="alert alert-error">{error}</div>
        )}

        {!loading && !error && data && !result && (
          <>
            {data.aprovacao_cliente ? (
              <div className="alert alert-error">
                Esta visita já foi <strong>{data.aprovacao_cliente === 'aprovado' ? 'aprovada' : 'recusada'}</strong> anteriormente. Nenhuma ação é necessária.
              </div>
            ) : (
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

                {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

                <div className="row-actions" style={{ gap: 12 }}>
                  <button className="btn btn-primary" style={{ flex: 1, padding: '14px 18px' }} disabled={submitting} onClick={() => act('aprovar')}>
                    Autorizar visita
                  </button>
                  <button className="btn btn-danger" style={{ flex: 1, padding: '14px 18px' }} disabled={submitting} onClick={() => act('recusar')}>
                    Recusar
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {result && (
          <div className={`alert ${result.aprovacao_cliente === 'aprovado' ? '' : 'alert-error'}`} style={result.aprovacao_cliente === 'aprovado' ? { background: 'rgba(30,142,90,0.1)', color: 'var(--verde)', border: '1px solid rgba(30,142,90,0.25)' } : undefined}>
            {result.message}
          </div>
        )}

        <p className="login-footer">© 2026 Mirontec. Todos os direitos reservados.</p>
      </main>
    </div>
  );
}
