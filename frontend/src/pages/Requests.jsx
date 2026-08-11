import { Fragment, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { getUser } from '../utils/auth';
import MapLink from '../components/MapLink';
import SearchableSelect from '../components/SearchableSelect';
import Pagination from '../components/Pagination';

const PAGE_SIZE = 25;

const STAFF_STATUSES = ['Aberta', 'Agendada', 'Em Atendimento', 'Concluída', 'Cancelada'];

const STATUS_BADGE = {
  'Aberta': 'badge-aberta',
  'Agendada': 'badge-agendada',
  'Em Atendimento': 'badge-em-atendimento',
  'Concluída': 'badge-concluida',
  'Cancelada': 'badge-cancelada'
};

function badgeClass(status) {
  return `badge ${STATUS_BADGE[status] || ''}`;
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR');
}

export default function Requests() {
  const user = getUser();
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [units, setUnits] = useState([]);
  const [equipments, setEquipments] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [parts, setParts] = useState([]);
  const [form, setForm] = useState({ empresa_id: '', unidade_id: '', equipamento_id: '', descricao: '', endereco: '', urgencia: 'Normal' });
  const [drafts, setDrafts] = useState({});
  const [expanded, setExpanded] = useState({});
  const [reportDrafts, setReportDrafts] = useState({});
  const [aprovacaoDrafts, setAprovacaoDrafts] = useState({});
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  const isClienteSemEmpresa = user?.role === 'cliente' && !user?.empresa_id;
  const canCreate = ['cliente', 'analista', 'gestor'].includes(user?.role) && !isClienteSemEmpresa;
  const canManage = ['analista', 'gestor'].includes(user?.role);
  const isTech = user?.role === 'tecnico';
  const isGestor = user?.role === 'gestor';

  const load = () => {
    api.get('/requests').then((res) => setRequests(res.data));
    api.get('/companies').then((res) => setCompanies(res.data)).catch(() => {});
    api.get('/units').then((res) => setUnits(res.data)).catch(() => {});
    api.get('/equipments').then((res) => setEquipments(res.data)).catch(() => {});
    if (canManage) {
      api.get('/users').then((res) => setTechnicians(res.data.filter((u) => u.role === 'tecnico'))).catch(() => {});
    }
    if (isTech) {
      api.get('/budgets').then((res) => setBudgets(res.data)).catch(() => {});
      api.get('/parts').then((res) => setParts(res.data)).catch(() => {});
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user?.role !== 'cliente' || !user?.empresa_id || form.endereco || (companies.length === 0 && units.length === 0)) return;
    const address = addressFor(user.empresa_id, user.unidade_id);
    if (address) setForm((f) => ({ ...f, endereco: address }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies, units]);

  const company = (id) => companies.find((c) => c.id === id);
  const unit = (id) => units.find((u) => u.id === id);
  const equipment = (id) => equipments.find((e) => e.id === id);
  const companyName = (id) => company(id)?.razao_social || '—';
  const unitLabel = (id) => {
    const u = unit(id);
    return u ? `${u.tipo} — ${u.nome}` : null;
  };
  const equipmentLabel = (id) => {
    const eq = equipment(id);
    return eq ? `${eq.modelo} — ${eq.numero_serie}` : '—';
  };
  const technicianName = (id) => technicians.find((t) => t.id === id)?.nome || (id ? id : 'Não atribuído');
  const partName = (id) => parts.find((p) => p.id === id)?.nome || 'Peça';
  const approvedBudgetFor = (requestId) => budgets.find((b) => b.request_id === requestId && b.status === 'Aprovado');

  const unitsForCompany = (empresaId) => units.filter((u) => u.empresa_id === empresaId);

  const addressFor = (empresaId, unidadeId) => {
    const u = unidadeId ? unit(unidadeId) : null;
    if (u) return [u.endereco, u.numero, u.bairro, u.cidade && u.estado ? `${u.cidade}/${u.estado}` : u.cidade].filter(Boolean).join(', ');
    const c = company(empresaId);
    return c?.endereco || '';
  };

  // Para cliente, o backend já devolve só o equipamento dele. Para a equipe,
  // a lista só faz sentido depois de escolher a empresa (e, se houver filial
  // selecionada, filtra também por ela — mostrando o que é da filial + o compartilhado).
  const equipmentsForForm = user?.role === 'cliente'
    ? equipments
    : equipments.filter((eq) => {
        if (eq.empresa_id !== form.empresa_id) return false;
        if (!form.unidade_id) return true;
        return !eq.unidade_id || eq.unidade_id === form.unidade_id;
      });

  const handleSubmit = async (e) => {
    e.preventDefault();
    await api.post('/requests', form);
    const resetEndereco = user?.role === 'cliente' ? addressFor(user.empresa_id, user.unidade_id) : '';
    setForm({ empresa_id: '', unidade_id: '', equipamento_id: '', descricao: '', endereco: resetEndereco, urgencia: 'Normal' });
    load();
  };

  const draftFor = (req) => drafts[req.id] || {
    status: req.status,
    assigned_technician: req.assigned_technician || '',
    agendado_para: req.agendado_para || ''
  };

  const setDraft = (req, patch) => {
    setDrafts((prev) => ({ ...prev, [req.id]: { ...draftFor(req), ...patch } }));
  };

  const saveManaged = async (req) => {
    const draft = draftFor(req);
    await api.patch(`/requests/${req.id}`, {
      status: draft.status,
      assigned_technician: draft.assigned_technician || null,
      agendado_para: draft.agendado_para || null
    });
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[req.id];
      return next;
    });
    load();
  };

  const toggleExpanded = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleDelete = async (req) => {
    if (!window.confirm('Excluir este chamado? Esta ação não pode ser desfeita.')) return;
    setError('');
    try {
      await api.delete(`/requests/${req.id}`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao excluir chamado');
    }
  };

  const handleDeleteTermo = async (req) => {
    if (!window.confirm('Excluir o termo de conclusão assinado deste chamado? Esta ação não pode ser desfeita.')) return;
    setError('');
    try {
      await api.delete(`/requests/${req.id}/termo-conclusao`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao excluir termo de conclusão');
    }
  };

  const aprovacaoDraftFor = (id) => aprovacaoDrafts[id] || { nome: '', cpf: '', telefone: '' };
  const setAprovacaoDraft = (id, patch) => setAprovacaoDrafts((prev) => ({ ...prev, [id]: { ...aprovacaoDraftFor(id), ...patch } }));

  const handleAprovacaoVisita = async (req, decisao) => {
    setError('');
    const draft = aprovacaoDraftFor(req.id);
    if (decisao === 'aprovado' && (!draft.nome.trim() || !draft.cpf.trim() || !draft.telefone.trim())) {
      setError('Preencha nome, CPF e telefone para autorizar a visita.');
      return;
    }
    try {
      await api.patch(`/requests/${req.id}/aprovacao-visita`, { decisao, ...draft });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao registrar sua decisão sobre a visita');
    }
  };

  const handleCheckin = async (req) => {
    setError('');
    try {
      await api.patch(`/requests/${req.id}`, { status: 'Em Atendimento' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao iniciar visita');
    }
  };

  const handleCheckout = async (req) => {
    setError('');
    const relatorio = reportDrafts[req.id] || '';
    if (!relatorio.trim()) {
      setError('Descreva o relatório da visita antes de concluir.');
      return;
    }
    try {
      await api.patch(`/requests/${req.id}`, { status: 'Concluída', relatorio_visita: relatorio });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao concluir visita');
    }
  };

  return (
    <div>
      <h2 className="page-title">Chamados</h2>
      {error && <div className="alert alert-error">{error}</div>}

      {isClienteSemEmpresa && (
        <div className="alert alert-error" style={{ marginBottom: 20 }}>
          Sua conta ainda não está vinculada a uma empresa. Aguarde o contato do gestor para começar a abrir chamados.
        </div>
      )}

      {canCreate && (
        <form onSubmit={handleSubmit} className="card-form">
          <h3>Abrir novo chamado</h3>
          {user?.role === 'cliente' && (
            <p className="section-text">
              Abrindo chamado para <strong>{companyName(user.empresa_id)}</strong>
              {unitLabel(user.unidade_id) && <> — <strong>{unitLabel(user.unidade_id)}</strong></>}
            </p>
          )}
          {user?.role !== 'cliente' && (
            <>
              <label className="form-field">
                Empresa
                <SearchableSelect
                  value={form.empresa_id}
                  onChange={(id) => setForm({ ...form, empresa_id: id, unidade_id: '', equipamento_id: '', endereco: addressFor(id, '') })}
                  placeholder="Digite para buscar a empresa..."
                  options={companies.map((c) => ({ value: c.id, label: c.razao_social, sublabel: c.cnpj }))}
                />
              </label>
              {form.empresa_id && unitsForCompany(form.empresa_id).length > 0 && (
                <label className="form-field">
                  Filial / Sede
                  <SearchableSelect
                    value={form.unidade_id}
                    onChange={(id) => setForm({ ...form, unidade_id: id, equipamento_id: '', endereco: addressFor(form.empresa_id, id) })}
                    placeholder="Digite para buscar a filial ou sede..."
                    options={unitsForCompany(form.empresa_id).map((u) => ({
                      value: u.id,
                      label: `${u.tipo} — ${u.nome}`,
                      sublabel: [u.endereco, u.cidade && u.estado ? `${u.cidade}/${u.estado}` : u.cidade].filter(Boolean).join(', ')
                    }))}
                  />
                </label>
              )}
            </>
          )}
          <label className="form-field">
            Equipamento
            <select
              className="form-select"
              value={form.equipamento_id}
              onChange={(e) => setForm({ ...form, equipamento_id: e.target.value })}
              required
              disabled={user?.role !== 'cliente' && !form.empresa_id}
            >
              <option value="">{user?.role !== 'cliente' && !form.empresa_id ? 'Selecione uma empresa primeiro' : 'Selecione'}</option>
              {equipmentsForForm.map((eq) => (
                <option key={eq.id} value={eq.id}>{eq.modelo} — {eq.numero_serie}</option>
              ))}
            </select>
          </label>
          <label className="form-field">
            Descrição
            <textarea className="form-textarea" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} required />
          </label>
          <label className="form-field">
            Endereço
            <input className="form-input" value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} required />
          </label>
          <label className="form-field">
            Urgência
            <select className="form-select" value={form.urgencia} onChange={(e) => setForm({ ...form, urgencia: e.target.value })}>
              <option value="Normal">Normal</option>
              <option value="Alta">Alta</option>
              <option value="Urgente">Urgente</option>
            </select>
          </label>
          <button type="submit" className="btn btn-primary">Abrir solicitação</button>
        </form>
      )}

      <table className="data-table">
        <thead>
          <tr>
            <th>Descrição</th>
            <th>Empresa</th>
            <th>Equipamento</th>
            <th>Status</th>
            <th>Técnico</th>
            <th></th>
            {(canManage || isTech) && <th></th>}
          </tr>
        </thead>
        <tbody>
          {requests.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((req) => {
            const draft = draftFor(req);
            const isMine = req.assigned_technician === user?.id;
            const isOpen = !!expanded[req.id];
            const eq = equipment(req.equipamento_id);
            const comp = company(req.empresa_id);
            return (
              <Fragment key={req.id}>
                <tr>
                  <td>{req.descricao}</td>
                  <td>{companyName(req.empresa_id)}</td>
                  <td>{equipmentLabel(req.equipamento_id)}</td>
                  <td><span className={badgeClass(req.status)}>{req.status}</span></td>
                  <td>{technicianName(req.assigned_technician)}</td>
                  <td>
                    <button className="btn btn-outline btn-sm" onClick={() => toggleExpanded(req.id)}>
                      {isOpen ? 'Ocultar' : 'Detalhes'}
                    </button>
                  </td>
                  {canManage && (
                    <td>
                      <div className="row-actions">
                        <select className="form-select" value={draft.assigned_technician} onChange={(e) => setDraft(req, { assigned_technician: e.target.value })}>
                          <option value="">Sem técnico</option>
                          {technicians.map((tech) => (<option key={tech.id} value={tech.id}>{tech.nome}</option>))}
                        </select>
                        <input className="form-input" type="date" value={draft.agendado_para ? draft.agendado_para.slice(0, 10) : ''} onChange={(e) => setDraft(req, { agendado_para: e.target.value })} />
                        <select className="form-select" value={draft.status} onChange={(e) => setDraft(req, { status: e.target.value })}>
                          {STAFF_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
                        </select>
                        <button className="btn btn-primary btn-sm" onClick={() => saveManaged(req)}>Salvar</button>
                        {isGestor && <button className="btn btn-danger btn-sm" onClick={() => handleDelete(req)}>Excluir</button>}
                      </div>
                    </td>
                  )}
                  {isTech && !canManage && (
                    <td>
                      {!isMine ? (
                        <span>—</span>
                      ) : req.hora_checkout ? (
                        <span className="badge badge-concluida">Visita concluída</span>
                      ) : req.hora_checkin ? (
                        <div className="row-actions" style={{ flexDirection: 'column', alignItems: 'stretch', minWidth: 220 }}>
                          <textarea
                            className="form-textarea"
                            placeholder="Relatório da visita (obrigatório para concluir)"
                            value={reportDrafts[req.id] || ''}
                            onChange={(e) => setReportDrafts((prev) => ({ ...prev, [req.id]: e.target.value }))}
                          />
                          <button className="btn btn-primary btn-sm" onClick={() => handleCheckout(req)}>Finalizar visita (check-out)</button>
                        </div>
                      ) : (
                        <button className="btn btn-outline btn-sm" onClick={() => handleCheckin(req)}>Iniciar visita (check-in)</button>
                      )}
                    </td>
                  )}
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={7}>
                      <div className="detail-panel">
                        <div className="detail-grid">
                          <div>
                            <strong>Empresa</strong>
                            <p>{comp?.razao_social || '—'}</p>
                            <MapLink address={req.endereco} label="Ver endereço da visita" />
                          </div>
                          <div>
                            <strong>Equipamento</strong>
                            <p>{eq ? `${eq.modelo} — Série ${eq.numero_serie}` : '—'}</p>
                            {eq?.local_instalacao && <p className="detail-muted">Instalado em: {eq.local_instalacao}</p>}
                            {eq?.garantia_ate && <p className="detail-muted">Garantia até: {eq.garantia_ate}</p>}
                          </div>
                          <div>
                            <strong>Urgência</strong>
                            <p>{req.urgencia}</p>
                          </div>
                          <div>
                            <strong>Aprovação do cliente</strong>
                            <p>
                              {req.aprovacao_cliente === 'aprovado' && <span className="badge badge-aprovado">Aprovada</span>}
                              {req.aprovacao_cliente === 'recusado' && <span className="badge badge-rejeitado">Recusada</span>}
                              {!req.aprovacao_cliente && <span className="badge badge-enviado">Aguardando</span>}
                            </p>
                            {req.aprovacao_cliente === 'aprovado' && req.aprovacao_nome && (canManage || isTech) && (
                              <p className="detail-muted">
                                Por: {req.aprovacao_nome} — CPF {req.aprovacao_cpf} — Tel {req.aprovacao_telefone}
                              </p>
                            )}
                          </div>
                          <div>
                            <strong>Aberto em</strong>
                            <p>{formatDateTime(req.criado_em)}</p>
                          </div>
                          <div>
                            <strong>Agendado para</strong>
                            <p>{req.agendado_para ? req.agendado_para.slice(0, 10) : 'Não agendado'}</p>
                          </div>
                          <div>
                            <strong>Check-in</strong>
                            <p>{formatDateTime(req.hora_checkin)}</p>
                          </div>
                          <div>
                            <strong>Check-out</strong>
                            <p>{formatDateTime(req.hora_checkout)}</p>
                          </div>
                        </div>
                        {isTech && approvedBudgetFor(req.id) && (
                          <div className="detail-report">
                            <strong>Peça e serviço aprovados pelo cliente</strong>
                            <p>
                              Peça: {approvedBudgetFor(req.id).items?.map((item) => partName(item.peca_id)).join(', ') || 'não informado'}
                            </p>
                            {approvedBudgetFor(req.id).motivo_troca && <p>Motivo da troca: {approvedBudgetFor(req.id).motivo_troca}</p>}
                            {approvedBudgetFor(req.id).observacoes_tecnicas && <p>Informações relevantes: {approvedBudgetFor(req.id).observacoes_tecnicas}</p>}
                          </div>
                        )}
                        {user?.role === 'cliente' && !req.aprovacao_cliente && (
                          <div className="detail-report">
                            <strong>Autorizar esta visita</strong>
                            <label className="form-field">
                              Nome completo
                              <input className="form-input" value={aprovacaoDraftFor(req.id).nome} onChange={(e) => setAprovacaoDraft(req.id, { nome: e.target.value })} />
                            </label>
                            <label className="form-field">
                              CPF
                              <input className="form-input" value={aprovacaoDraftFor(req.id).cpf} onChange={(e) => setAprovacaoDraft(req.id, { cpf: e.target.value })} placeholder="000.000.000-00" />
                            </label>
                            <label className="form-field">
                              Telefone
                              <input className="form-input" value={aprovacaoDraftFor(req.id).telefone} onChange={(e) => setAprovacaoDraft(req.id, { telefone: e.target.value })} placeholder="(00) 00000-0000" />
                            </label>
                            <div className="row-actions" style={{ marginTop: 8 }}>
                              <button type="button" className="btn btn-primary btn-sm" onClick={() => handleAprovacaoVisita(req, 'aprovado')}>Autorizar visita</button>
                              <button type="button" className="btn btn-danger btn-sm" onClick={() => handleAprovacaoVisita(req, 'recusado')}>Recusar</button>
                            </div>
                          </div>
                        )}
                        {req.relatorio_visita && (
                          <div className="detail-report">
                            <strong>Relatório da visita</strong>
                            <p>{req.relatorio_visita}</p>
                          </div>
                        )}
                        {req.status === 'Concluída' && (user?.role === 'cliente' || canManage) && (
                          <div className="row-actions" style={{ marginTop: 12 }}>
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate(`/visitas/${req.id}/termo`)}>
                              Termo de conclusão da visita
                            </button>
                            {isGestor && (
                              <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDeleteTermo(req)}>
                                Excluir termo assinado
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      <Pagination page={page} totalPages={Math.max(1, Math.ceil(requests.length / PAGE_SIZE))} onChange={setPage} />
    </div>
  );
}
