import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api';

function money(value) {
  return `R$ ${Number(value || 0).toFixed(2)}`;
}

export default function ApproveBudget() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.get(`/public/budgets/${token}`)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Não foi possível carregar este orçamento.'))
      .finally(() => setLoading(false));
  }, [token]);

  const act = async (action) => {
    setSubmitting(true);
    setError('');
    try {
      const res = await api.post(`/public/budgets/${token}/${action}`);
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
            <span>Aprovação de orçamento</span>
          </div>
        </div>

        {loading && <p className="section-text">Carregando orçamento…</p>}

        {!loading && error && !result && (
          <div className="alert alert-error">{error}</div>
        )}

        {!loading && !error && data && !result && (
          <>
            {data.status !== 'Enviado' ? (
              <div className="alert alert-error">Este orçamento já foi <strong>{data.status.toLowerCase()}</strong> anteriormente. Nenhuma ação é necessária.</div>
            ) : (
              <>
                <h1 className="login-card__headline">VISITA TÉCNICA</h1>

                <div className="detail-panel" style={{ marginBottom: 20 }}>
                  <div className="detail-grid">
                    <div>
                      <strong>Cliente</strong>
                      <p>{data.empresa}</p>
                    </div>
                    {data.unidade && (
                      <div>
                        <strong>Unidade</strong>
                        <p>{data.unidade}</p>
                      </div>
                    )}
                    {data.equipamento && (
                      <div>
                        <strong>Equipamento</strong>
                        <p>{data.equipamento}</p>
                      </div>
                    )}
                    {data.problema && (
                      <div>
                        <strong>Problema</strong>
                        <p>{data.problema}</p>
                      </div>
                    )}
                  </div>

                  <strong style={{ display: 'block', marginTop: 16 }}>SERVIÇO</strong>
                  {data.items?.length > 0 && (
                    <ul className="item-list" style={{ marginTop: 8 }}>
                      {data.items.map((item, idx) => (
                        <li key={idx}>
                          <span>Peça: {item.nome} — Quantidade: {item.quantidade}</span>
                          <span>{money(item.valor_unitario * item.quantidade)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {data.motivo_troca && <p style={{ marginTop: 8 }}><strong>Motivo da troca:</strong> {data.motivo_troca}</p>}
                  {data.observacoes_tecnicas && <p><strong>Informações relevantes:</strong> {data.observacoes_tecnicas}</p>}
                  <p><strong>Valor da peça:</strong> {money(data.pecas_total)}</p>
                  <p><strong>Visita técnica:</strong> {money(data.deslocamento)}</p>

                  <div className="detail-report">
                    <strong>TOTAL</strong>
                    <p style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--grafite)' }}>{money(data.total)}</p>
                  </div>
                </div>

                {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

                <div className="row-actions" style={{ gap: 12 }}>
                  <button className="btn btn-primary" style={{ flex: 1, padding: '14px 18px' }} disabled={submitting} onClick={() => act('approve')}>
                    AUTORIZAR
                  </button>
                  <button className="btn btn-danger" style={{ flex: 1, padding: '14px 18px' }} disabled={submitting} onClick={() => act('reject')}>
                    NÃO AUTORIZAR
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {result && (
          <div className={`alert ${result.status === 'Aprovado' ? '' : 'alert-error'}`} style={result.status === 'Aprovado' ? { background: 'rgba(30,142,90,0.1)', color: 'var(--verde)', border: '1px solid rgba(30,142,90,0.25)' } : undefined}>
            {result.message}
            {result.contractNumber && (
              <p style={{ margin: '8px 0 0', fontWeight: 700 }}>Contrato: {result.contractNumber}</p>
            )}
          </div>
        )}

        <p className="login-footer">© 2026 Mirontec. Todos os direitos reservados.</p>
      </main>
    </div>
  );
}
