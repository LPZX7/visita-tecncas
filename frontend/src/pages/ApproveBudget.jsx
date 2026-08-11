import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';
import { getUser } from '../utils/auth';

function money(value) {
  return `R$ ${Number(value || 0).toFixed(2)}`;
}

export default function ApproveBudget() {
  const { token } = useParams();
  const user = getUser();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [autorizante, setAutorizante] = useState({ nome: '', cpf: '', telefone: '' });

  useEffect(() => {
    api.get(`/public/budgets/${token}`)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Não foi possível carregar este orçamento.'))
      .finally(() => setLoading(false));
  }, [token]);

  const act = async (status) => {
    setError('');
    if (status === 'Aprovado') {
      if (!autorizante.nome.trim() || !autorizante.cpf.trim() || !autorizante.telefone.trim()) {
        setError('Preencha seu nome, CPF e telefone para autorizar o orçamento.');
        return;
      }
    }
    setSubmitting(true);
    try {
      const res = await api.patch(`/budgets/${data.budget_id}/status`, status === 'Aprovado' ? { status, ...autorizante } : { status });
      setResult({
        status: res.data.status,
        message: status === 'Aprovado' ? 'Orçamento autorizado com sucesso. Nossa equipe foi notificada e o contrato foi gerado.' : 'Orçamento não autorizado. Nossa equipe foi notificada.'
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível registrar sua resposta.');
    } finally {
      setSubmitting(false);
    }
  };

  const loginLink = `/login?redirect=${encodeURIComponent(`/aprovar-orcamento/${token}`)}`;

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

        {!loading && error && !result && !data && (
          <div className="alert alert-error">{error}</div>
        )}

        {!loading && data && !result && (
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

                {!user ? (
                  <div className="alert alert-error" style={{ marginBottom: 16 }}>
                    Por segurança, é preciso fazer login na sua conta para autorizar ou não autorizar este orçamento.
                    <div style={{ marginTop: 12 }}>
                      <Link to={loginLink} className="btn btn-primary">Fazer login para continuar</Link>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="detail-panel" style={{ marginBottom: 20 }}>
                      <strong style={{ display: 'block', marginBottom: 8 }}>Dados de quem está autorizando</strong>
                      <label className="form-field">
                        Nome completo
                        <input className="form-input" value={autorizante.nome} onChange={(e) => setAutorizante({ ...autorizante, nome: e.target.value })} />
                      </label>
                      <label className="form-field">
                        CPF
                        <input className="form-input" value={autorizante.cpf} onChange={(e) => setAutorizante({ ...autorizante, cpf: e.target.value })} placeholder="000.000.000-00" />
                      </label>
                      <label className="form-field">
                        Telefone
                        <input className="form-input" value={autorizante.telefone} onChange={(e) => setAutorizante({ ...autorizante, telefone: e.target.value })} placeholder="(00) 00000-0000" />
                      </label>
                      <p className="detail-muted">Obrigatório apenas para autorizar. Para não autorizar, não é necessário preencher.</p>
                    </div>

                    {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

                    <div className="row-actions" style={{ gap: 12 }}>
                      <button className="btn btn-primary" style={{ flex: 1, padding: '14px 18px' }} disabled={submitting} onClick={() => act('Aprovado')}>
                        AUTORIZAR
                      </button>
                      <button className="btn btn-danger" style={{ flex: 1, padding: '14px 18px' }} disabled={submitting} onClick={() => act('Rejeitado')}>
                        NÃO AUTORIZAR
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}

        {result && (
          <div className={`alert ${result.status === 'Aprovado' ? '' : 'alert-error'}`} style={result.status === 'Aprovado' ? { background: 'rgba(30,142,90,0.1)', color: 'var(--verde)', border: '1px solid rgba(30,142,90,0.25)' } : undefined}>
            {result.message}
          </div>
        )}

        <p className="login-footer">© 2026 Mirontec. Todos os direitos reservados.</p>
      </main>
    </div>
  );
}
