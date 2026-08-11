import { useEffect, useState } from 'react';
import api from '../api';
import SearchableSelect from '../components/SearchableSelect';

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR');
}

export default function MilvusImport() {
  const [pendentes, setPendentes] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [units, setUnits] = useState([]);
  const [equipments, setEquipments] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [syncing, setSyncing] = useState(false);

  const load = () => {
    api.get('/milvus-import').then((res) => setPendentes(res.data)).catch(() => {});
    api.get('/companies').then((res) => setCompanies(res.data)).catch(() => {});
    api.get('/units').then((res) => setUnits(res.data)).catch(() => {});
    api.get('/equipments').then((res) => setEquipments(res.data)).catch(() => {});
  };

  useEffect(() => {
    load();
  }, []);

  const draftFor = (id) => drafts[id] || { empresa_id: '', unidade_id: '', equipamento_id: '', urgencia: 'Normal', endereco: '' };
  const setDraft = (id, patch) => setDrafts((prev) => ({ ...prev, [id]: { ...draftFor(id), ...patch } }));

  const unitsForCompany = (empresaId) => units.filter((u) => u.empresa_id === empresaId);

  const equipmentsForCompany = (empresaId, unidadeId) => equipments.filter((eq) => {
    if (eq.empresa_id !== empresaId) return false;
    if (!unidadeId) return true;
    return !eq.unidade_id || eq.unidade_id === unidadeId;
  });

  const addressFor = (empresaId, unidadeId) => {
    const unit = unidadeId ? units.find((u) => u.id === unidadeId) : null;
    if (unit) return [unit.endereco, unit.numero, unit.bairro, unit.cidade && unit.estado ? `${unit.cidade}/${unit.estado}` : unit.cidade].filter(Boolean).join(', ');
    const company = companies.find((c) => c.id === empresaId);
    return company?.endereco || '';
  };

  const sync = async () => {
    setSyncing(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.post('/milvus-import/sync');
      setSuccess(`Sincronizado: ${res.data.encontrados} ticket(s) encontrado(s), ${res.data.novos} novo(s).`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao sincronizar com o Milvus');
    } finally {
      setSyncing(false);
    }
  };

  const importar = async (id) => {
    setError('');
    setSuccess('');
    const draft = draftFor(id);
    if (!draft.empresa_id || !draft.equipamento_id) {
      setError('Selecione o solicitante e o equipamento antes de importar.');
      return;
    }
    try {
      await api.post(`/milvus-import/${id}/importar`, draft);
      setSuccess('Chamado importado com sucesso.');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao importar chamado');
    }
  };

  const ignorar = async (id) => {
    if (!window.confirm('Ignorar este ticket? Ele não será importado.')) return;
    setError('');
    try {
      await api.post(`/milvus-import/${id}/ignorar`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao ignorar ticket');
    }
  };

  return (
    <div>
      <h2 className="page-title">Importar do Milvus</h2>
      <p className="section-text">
        Tickets abertos no Milvus com a categoria "Visita Técnica" aparecem aqui para revisão. Escolha a empresa e o
        equipamento certos antes de importar como chamado no sistema.
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="row-actions" style={{ marginBottom: 20 }}>
        <button type="button" className="btn btn-outline" onClick={sync} disabled={syncing}>
          {syncing ? 'Sincronizando...' : 'Sincronizar agora'}
        </button>
      </div>

      {pendentes.length === 0 ? (
        <p className="section-text">Nenhum ticket pendente de importação.</p>
      ) : (
        pendentes.map((p) => {
          const draft = draftFor(p.id);
          return (
            <div key={p.id} className="panel-card" style={{ maxWidth: 720, marginBottom: 16 }}>
              <h3>{p.assunto || `Ticket Milvus #${p.milvus_codigo}`}</h3>
              <dl className="info-list">
                <div><dt>Código Milvus</dt><dd>#{p.milvus_codigo}</dd></div>
                <div><dt>Cliente</dt><dd>{p.cliente_nome || '—'}</dd></div>
                <div><dt>Email</dt><dd>{p.cliente_email || '—'}</dd></div>
                <div><dt>Telefone</dt><dd>{p.cliente_telefone || '—'}</dd></div>
                <div><dt>Recebido em</dt><dd>{formatDateTime(p.criado_em)}</dd></div>
              </dl>
              {p.descricao && <p className="section-text">{p.descricao}</p>}

              <label className="form-field">
                Solicitante
                <SearchableSelect
                  value={draft.empresa_id}
                  onChange={(id) => setDraft(p.id, { empresa_id: id, unidade_id: '', equipamento_id: '', endereco: addressFor(id, '') })}
                  placeholder="Digite para buscar a empresa..."
                  options={companies.map((c) => ({ value: c.id, label: c.razao_social, sublabel: c.cnpj }))}
                />
              </label>
              {draft.empresa_id && unitsForCompany(draft.empresa_id).length > 0 && (
                <label className="form-field">
                  Unidade de Negócio
                  <SearchableSelect
                    value={draft.unidade_id}
                    onChange={(id) => setDraft(p.id, { unidade_id: id, equipamento_id: '', endereco: addressFor(draft.empresa_id, id) })}
                    placeholder="Digite para buscar a filial ou sede..."
                    emptyMessage="Nenhuma unidade cadastrada para esta empresa."
                    options={unitsForCompany(draft.empresa_id).map((u) => ({
                      value: u.id,
                      label: `${u.tipo} — ${u.nome}`,
                      sublabel: [u.endereco, u.cidade && u.estado ? `${u.cidade}/${u.estado}` : u.cidade].filter(Boolean).join(', ')
                    }))}
                  />
                </label>
              )}
              <label className="form-field">
                Equipamento
                <select
                  className="form-select"
                  value={draft.equipamento_id}
                  onChange={(e) => setDraft(p.id, { equipamento_id: e.target.value })}
                  disabled={!draft.empresa_id}
                >
                  <option value="">{draft.empresa_id ? 'Selecione' : 'Selecione uma empresa primeiro'}</option>
                  {equipmentsForCompany(draft.empresa_id, draft.unidade_id).map((eq) => (
                    <option key={eq.id} value={eq.id}>{eq.modelo} — {eq.numero_serie}</option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                Endereço
                <input className="form-input" value={draft.endereco} onChange={(e) => setDraft(p.id, { endereco: e.target.value })} />
              </label>
              <label className="form-field">
                Urgência
                <select className="form-select" value={draft.urgencia} onChange={(e) => setDraft(p.id, { urgencia: e.target.value })}>
                  <option value="Normal">Normal</option>
                  <option value="Alta">Alta</option>
                  <option value="Urgente">Urgente</option>
                </select>
              </label>

              <div className="row-actions" style={{ marginTop: 12 }}>
                <button type="button" className="btn btn-primary" onClick={() => importar(p.id)}>Importar como chamado</button>
                <button type="button" className="btn btn-outline" onClick={() => ignorar(p.id)}>Ignorar</button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
