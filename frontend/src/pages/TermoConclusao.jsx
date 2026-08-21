import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { getUser } from '../utils/auth';
import TechnicalRecord from '../components/TechnicalRecord';

const DECLARACAO = 'Declaro que acompanhei e/ou estou autorizado a representar o contratante para confirmar a conclusão do serviço descrito acima. Declaro ainda que as informações apresentadas correspondem ao atendimento realizado nesta visita técnica.';

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR');
}

export default function TermoConclusao() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = getUser();
  const isCliente = user?.role === 'cliente';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [step, setStep] = useState('resumo'); // resumo -> identificacao -> confirmacao -> feito
  const [form, setForm] = useState({ nome: '', documento: '', cargo: '', email: user?.email || '', telefone: '' });
  const [confirmaDados, setConfirmaDados] = useState(false);
  const [aceitaTermo, setAceitaTermo] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resultado, setResultado] = useState(null);

  const load = () => {
    setLoading(true);
    setError('');
    api.get(`/requests/${id}/termo-conclusao`)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Erro ao carregar dados da visita'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const openPdf = () => {
    api.get(`/requests/${id}/termo-conclusao/pdf`, { responseType: 'blob' }).then((res) => {
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
    });
  };

  const submitAceite = async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await api.post(`/requests/${id}/termo-conclusao`, {
        ...form,
        confirmaDados,
        aceitaTermo
      });
      setResultado(res.data);
      setStep('feito');
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao registrar o aceite');
      setStep('identificacao');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div><p className="section-text">Carregando…</p></div>;

  if (error && !data) {
    return (
      <div>
        <h2 className="page-title">Termo de Conclusão de Visita</h2>
        <div className="alert alert-error">{error}</div>
      </div>
    );
  }

  if (!data) return null;

  if (data.ja_aceito) {
    return (
      <div>
        <h2 className="page-title">Termo de Conclusão — Visita #{data.visita.numero}</h2>
        <div className="panel-card" style={{ maxWidth: 560 }}>
          <p className="section-text">Esta visita já teve o termo de conclusão assinado.</p>
          <dl className="info-list">
            <div><dt>Assinado por</dt><dd>{data.aceite.nome_aceitante}</dd></div>
            <div><dt>Data/hora</dt><dd>{formatDateTime(data.aceite.criado_em)}</dd></div>
            <div><dt>Código de validação</dt><dd>{data.aceite.codigo_validacao}</dd></div>
          </dl>
          <div className="row-actions" style={{ marginTop: 16 }}>
            <button type="button" className="btn btn-primary" onClick={openPdf}>Baixar termo</button>
            <button type="button" className="btn btn-outline" onClick={() => navigate('/requests')}>Voltar aos chamados</button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'feito' && resultado) {
    return (
      <div>
        <h2 className="page-title">Visita técnica concluída</h2>
        <div className="panel-card" style={{ maxWidth: 560 }}>
          <div className="alert alert-success">Aceite registrado com sucesso.</div>
          <dl className="info-list">
            <div><dt>Visita</dt><dd>#{data.visita.numero}</dd></div>
            {data.contrato && <div><dt>Contrato</dt><dd>{data.contrato.numero}</dd></div>}
            <div><dt>Empresa</dt><dd>{data.empresa?.razao_social}</dd></div>
            <div><dt>Técnico</dt><dd>{data.tecnico?.nome || '—'}</dd></div>
            <div><dt>Data/hora do aceite</dt><dd>{formatDateTime(resultado.criado_em)}</dd></div>
            <div><dt>Código de validação</dt><dd>{resultado.codigo_validacao}</dd></div>
          </dl>
          <div className="row-actions" style={{ marginTop: 16 }}>
            <button type="button" className="btn btn-primary" onClick={openPdf}>Baixar termo</button>
            <button type="button" className="btn btn-outline" onClick={() => navigate('/requests')}>Voltar aos chamados</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="page-title">Termo de Conclusão e Aceite de Visita Técnica</h2>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="panel-card" style={{ maxWidth: 640 }}>
        <h3>Visita #{data.visita.numero}</h3>
        <dl className="info-list">
          {data.contrato && <div><dt>Contrato</dt><dd>{data.contrato.numero}</dd></div>}
          <div><dt>Cliente</dt><dd>{data.empresa?.razao_social}</dd></div>
          {data.unidade && <div><dt>{data.unidade.tipo}</dt><dd>{data.unidade.nome}</dd></div>}
          <div><dt>Técnico responsável</dt><dd>{data.tecnico?.nome || '—'}</dd></div>
          <div><dt>Check-in</dt><dd>{formatDateTime(data.visita.hora_checkin)}</dd></div>
          <div><dt>Check-out</dt><dd>{formatDateTime(data.visita.hora_checkout)}</dd></div>
          <div><dt>Problema informado</dt><dd>{data.visita.descricao}</dd></div>
        </dl>
        {(data.visita.registro_tecnico || data.visita.relatorio_visita) && (
          <div style={{ marginTop: 12 }}>
            <strong>Registro técnico</strong>
            <TechnicalRecord value={data.visita.registro_tecnico || data.visita.relatorio_visita} />
          </div>
        )}
      </div>

      {isCliente && step === 'resumo' && (
        <div className="panel-card" style={{ maxWidth: 640, marginTop: 16 }}>
          <h3>Termo de Conclusão e Aceite</h3>
          <p className="section-text" style={{ fontStyle: 'italic' }}>{DECLARACAO}</p>
          <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setStep('identificacao')}>
            Continuar para identificação
          </button>
        </div>
      )}

      {isCliente && step === 'identificacao' && (
        <div className="panel-card" style={{ maxWidth: 640, marginTop: 16 }}>
          <h3>Confirme seus dados</h3>
          <label className="form-field">Nome completo<input className="form-input" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required /></label>
          <label className="form-field">CPF/CNPJ<input className="form-input" value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} /></label>
          <label className="form-field">Cargo/função<input className="form-input" value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} /></label>
          <label className="form-field">E-mail<input className="form-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label className="form-field">Telefone<input className="form-input" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></label>

          <label className="checkbox-field" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12 }}>
            <input type="checkbox" checked={confirmaDados} onChange={(e) => setConfirmaDados(e.target.checked)} />
            <span>Declaro que os dados informados estão corretos e que possuo autorização para realizar este aceite.</span>
          </label>

          <label className="checkbox-field" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 8 }}>
            <input type="checkbox" checked={aceitaTermo} onChange={(e) => setAceitaTermo(e.target.checked)} />
            <span>Li e concordo com o Termo de Conclusão e Aceite de Visita Técnica e confirmo a conclusão do atendimento conforme as informações apresentadas.</span>
          </label>

          <div className="row-actions" style={{ marginTop: 16 }}>
            <button type="button" className="btn btn-outline" onClick={() => setStep('resumo')}>Voltar</button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!form.nome.trim() || !confirmaDados || !aceitaTermo}
              onClick={() => setStep('confirmacao')}
            >
              Confirmar aceite e concluir visita
            </button>
          </div>
        </div>
      )}

      {isCliente && step === 'confirmacao' && (
        <div className="panel-card" style={{ maxWidth: 640, marginTop: 16 }}>
          <h3>Confirmação de conclusão</h3>
          <p className="section-text">
            Você está confirmando formalmente a conclusão desta visita técnica. Após a confirmação, o sistema
            registrará o aceite, a data e hora da operação e as informações necessárias para auditoria.
          </p>
          <p className="section-text"><strong>Deseja continuar?</strong></p>
          <div className="row-actions" style={{ marginTop: 16 }}>
            <button type="button" className="btn btn-outline" onClick={() => setStep('identificacao')} disabled={submitting}>Voltar</button>
            <button type="button" className="btn btn-primary" onClick={submitAceite} disabled={submitting}>
              {submitting ? 'Registrando...' : 'Confirmar e assinar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
