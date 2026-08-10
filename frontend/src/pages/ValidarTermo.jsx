import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api';

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR');
}

export default function ValidarTermo() {
  const { codigo } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/public/validar/${codigo}`)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Documento não encontrado ou inválido'))
      .finally(() => setLoading(false));
  }, [codigo]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', padding: 20 }}>
      <div style={{ maxWidth: 440, width: '100%', background: '#fff', borderRadius: 16, padding: 32, boxShadow: '0 12px 30px rgba(15,23,42,0.08)' }}>
        <h2 style={{ marginTop: 0 }}>Validação de Documento</h2>
        {loading && <p className="section-text">Verificando…</p>}
        {!loading && error && (
          <div className="alert alert-error">{error}</div>
        )}
        {!loading && data && (
          <>
            <div className="alert alert-success" style={{ fontWeight: 700 }}>DOCUMENTO VÁLIDO</div>
            <dl className="info-list" style={{ marginTop: 16 }}>
              {data.visita_numero && <div><dt>Visita</dt><dd>#{data.visita_numero}</dd></div>}
              {data.contrato_numero && <div><dt>Contrato</dt><dd>{data.contrato_numero}</dd></div>}
              <div><dt>Data do aceite</dt><dd>{formatDateTime(data.data_aceite)}</dd></div>
              <div><dt>Aceitante</dt><dd>{data.nome_aceitante}</dd></div>
              <div><dt>Código</dt><dd>{data.codigo_validacao}</dd></div>
              <div><dt>Versão do termo</dt><dd>{data.versao_termo}</dd></div>
              <div><dt>Hash</dt><dd style={{ wordBreak: 'break-all', fontSize: '0.75rem' }}>{data.hash_documento}</dd></div>
            </dl>
          </>
        )}
      </div>
    </div>
  );
}
