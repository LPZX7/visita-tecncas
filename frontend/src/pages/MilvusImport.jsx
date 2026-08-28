import { useEffect, useState } from 'react';
import api from '../api';
import SearchableSelect from '../components/SearchableSelect';

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR');
}

function norm(str) {
  return (str || '').toLowerCase().trim();
}

// Casa o "Cliente" do ticket Milvus com uma empresa cadastrada pelo nome
// (razão social ou fantasia). Só assume o match se for único — em caso de
// ambiguidade, deixa em branco para o usuário escolher manualmente.
function matchCompany(pendente, companies) {
  const nome = norm(pendente.cliente_nome);
  if (!nome) return null;
  const candidates = companies.filter((c) => {
    const razao = norm(c.razao_social);
    const fantasia = norm(c.nome_fantasia);
    return (razao && (razao === nome || razao.includes(nome) || nome.includes(razao)))
      || (fantasia && (fantasia === nome || fantasia.includes(nome) || nome.includes(fantasia)));
  });
  return candidates.length === 1 ? candidates[0] : null;
}

// Dentro da empresa já casada, tenta achar a unidade certa pelo email do
// ticket (bate com o email cadastrado na unidade) ou pelo nome da unidade
// aparecendo no nome do cliente do ticket (ex.: "Mirontec – Atibaia").
function matchUnit(pendente, unitsOfCompany) {
  const emails = norm(pendente.cliente_email).split(',').map((e) => e.trim()).filter(Boolean);
  const nome = norm(pendente.cliente_nome);
  const candidates = unitsOfCompany.filter((u) => {
    const unitEmails = norm(u.email).split(',').map((e) => e.trim()).filter(Boolean);
    if (emails.length && unitEmails.some((ue) => emails.includes(ue))) return true;
    const unome = norm(u.nome);
    return unome && (nome.includes(unome) || unome.includes(nome));
  });
  return candidates.length === 1 ? candidates[0] : null;
}

function wordsOf(str) {
  return norm(str).split(/[^a-zà-ú0-9]+/i).filter((w) => w.length >= 4);
}

// Procura, no texto do ticket, alguma palavra que também apareça no modelo
// de um equipamento já cadastrado para essa empresa/unidade — ex.: texto
// "braço da catraca" bate com o equipamento de modelo "Catraca X200" pela
// palavra "catraca" em comum, mesmo sem o texto citar o modelo inteiro.
function matchEquipment(pendente, equipmentsOfCompany) {
  const textWords = new Set(wordsOf(`${pendente.assunto || ''} ${pendente.descricao || ''}`));
  if (textWords.size === 0) return null;
  const candidates = equipmentsOfCompany.filter((eq) => eq.modelo && wordsOf(eq.modelo).some((w) => textWords.has(w)));
  return candidates.length === 1 ? candidates[0] : null;
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
  const [statusFilter, setStatusFilter] = useState('pendente');

  const load = (status = statusFilter) => {
    api.get('/milvus-import', { params: { status } }).then((res) => setPendentes(res.data)).catch(() => {});
    api.get('/companies').then((res) => setCompanies(res.data)).catch(() => {});
    api.get('/units').then((res) => setUnits(res.data)).catch(() => {});
    api.get('/equipments').then((res) => setEquipments(res.data)).catch(() => {});
  };

  useEffect(() => {
    load(statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const draftFor = (id) => {
    const ticket = pendentes.find((item) => item.id === id);
    return drafts[id] || { empresa_id: '', unidade_id: '', equipamento_id: '', urgencia: 'Normal', endereco: '', solicitante_email: ticket?.cliente_email || '' };
  };
  const setDraft = (id, patch) => setDrafts((prev) => ({ ...prev, [id]: { ...draftFor(id), ...patch, _auto: false } }));

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

  // Pré-preenche solicitante, unidade, equipamento e endereço a partir dos
  // dados do próprio ticket Milvus, para qualquer empresa — sempre editável,
  // o usuário confirma (ou corrige) antes de importar.
  useEffect(() => {
    if (!pendentes.length || !companies.length) return;
    setDrafts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const p of pendentes) {
        if (next[p.id]) continue;
        const company = matchCompany(p, companies);
        if (!company) continue;
        const unit = matchUnit(p, units.filter((u) => u.empresa_id === company.id));
        const equipment = matchEquipment(p, equipmentsForCompany(company.id, unit?.id || ''));
        next[p.id] = {
          empresa_id: company.id,
          unidade_id: unit?.id || '',
          equipamento_id: equipment?.id || '',
          urgencia: 'Normal',
          endereco: addressFor(company.id, unit?.id || ''),
          solicitante_email: p.cliente_email || unit?.email || company.email || '',
          _auto: true
        };
        changed = true;
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendentes, companies, units, equipments]);

  const sync = async () => {
    setSyncing(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.post('/milvus-import/sync');
      setSuccess(`Sincronizado: ${res.data.novos} novo(s), ${res.data.importados_automaticamente || 0} importado(s) automaticamente e ${res.data.aguardando_revisao || 0} aguardando revisão.`);
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.solicitante_email || '')) {
      setError('Informe um e-mail válido do cliente antes de importar.');
      return;
    }
    try {
      const res = await api.post(`/milvus-import/${id}/importar`, draft);
      const pecas = res.data.pecas_identificadas || [];
      setSuccess(
        pecas.length > 0
          ? `Chamado importado e orçamento em rascunho criado com: ${pecas.join(', ')}.${res.data.motivo_identificado ? ` Motivo identificado: ${res.data.motivo_identificado}.` : ' O Milvus não informou um motivo; isso não impede o orçamento.'}`
          : 'Chamado importado e orçamento (rascunho) criado — nenhuma peça foi identificada automaticamente, adicione manualmente em Orçamentos antes de enviar.'
      );
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
        Tickets do Milvus são importados automaticamente quando empresa, equipamento, peça e e-mail são identificados com segurança.
        Somente os casos incompletos ou ambíguos ficam aqui para revisão.
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="row-actions" style={{ marginBottom: 20 }}>
        <button type="button" className="btn btn-outline" onClick={sync} disabled={syncing}>
          {syncing ? 'Sincronizando...' : 'Sincronizar agora'}
        </button>
        <select className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ maxWidth: 220 }}>
          <option value="pendente">Pendentes</option>
          <option value="importado">Importados</option>
          <option value="ignorado">Ignorados</option>
          <option value="todos">Todos</option>
        </select>
      </div>

      {pendentes.length === 0 ? (
        <p className="section-text">Nenhum ticket com esse status.</p>
      ) : (
        pendentes.map((p) => {
          const draft = draftFor(p.id);
          return (
            <div key={p.id} className="panel-card" style={{ maxWidth: 720, marginBottom: 16 }}>
              <h3>
                {p.assunto || `Ticket Milvus #${p.milvus_codigo}`}
                {statusFilter === 'todos' && <span className={`badge ${p.status === 'importado' ? 'badge-aprovado' : p.status === 'ignorado' ? 'badge-rejeitado' : 'badge-enviado'}`} style={{ marginLeft: 8 }}>{p.status}</span>}
              </h3>
              <dl className="info-list">
                <div><dt>Código Milvus</dt><dd>#{p.milvus_codigo}</dd></div>
                <div><dt>Cliente</dt><dd>{p.cliente_nome || '—'}</dd></div>
                <div><dt>Email</dt><dd>{p.cliente_email || '—'}</dd></div>
                <div><dt>Telefone</dt><dd>{p.cliente_telefone || '—'}</dd></div>
                <div><dt>Recebido em</dt><dd>{formatDateTime(p.criado_em)}</dd></div>
              </dl>
              {p.descricao && <p className="section-text">{p.descricao}</p>}
              {p.auto_observacao && <p className="section-text detail-muted">{p.auto_observacao}</p>}
              {p.status !== 'pendente' && (
                <p className="section-text detail-muted">Este ticket já foi {p.status} — não pode ser importado de novo.</p>
              )}
              {p.status === 'pendente' && draft._auto && (
                <p className="section-text" style={{ color: 'var(--verde, #1e8e5a)' }}>
                  Solicitante, equipamento e endereço pré-preenchidos automaticamente a partir do ticket — confira antes de importar.
                </p>
              )}

              {p.status === 'pendente' && (
                <>
                  <label className="form-field">
                    Solicitante
                    <SearchableSelect
                      value={draft.empresa_id}
                      onChange={(id) => setDraft(p.id, { empresa_id: id, unidade_id: '', equipamento_id: '', endereco: addressFor(id, ''), solicitante_email: p.cliente_email || companies.find((c) => c.id === id)?.email || '' })}
                      placeholder="Digite para buscar a empresa..."
                      options={companies.map((c) => ({ value: c.id, label: c.nome_fantasia || c.razao_social, sublabel: [c.razao_social, c.cnpj].filter(Boolean).join(' · ') }))}
                    />
                  </label>
                  {draft.empresa_id && unitsForCompany(draft.empresa_id).length > 0 && (
                    <label className="form-field">
                      Unidade de Negócio
                      <SearchableSelect
                        value={draft.unidade_id}
                        onChange={(id) => setDraft(p.id, { unidade_id: id, equipamento_id: '', endereco: addressFor(draft.empresa_id, id), solicitante_email: units.find((u) => u.id === id)?.email || draft.solicitante_email || companies.find((c) => c.id === draft.empresa_id)?.email || '' })}
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
                    E-mail do cliente
                    <input
                      className="form-input"
                      type="email"
                      value={draft.solicitante_email || ''}
                      onChange={(e) => setDraft(p.id, { solicitante_email: e.target.value })}
                      placeholder="cliente@empresa.com.br"
                      required
                    />
                    <small className="detail-muted">Obrigatório para avisos, aprovação e conclusão do atendimento.</small>
                  </label>
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
                </>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
