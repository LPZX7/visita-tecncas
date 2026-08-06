import { Fragment, useEffect, useState } from 'react';
import api from '../api';
import { getUser } from '../utils/auth';
import MapLink from '../components/MapLink';

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
  const [requests, setRequests] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [equipments, setEquipments] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [form, setForm] = useState({ empresa_id: '', equipamento_id: '', descricao: '', endereco: '', urgencia: 'Normal' });
  const [drafts, setDrafts] = useState({});
  const [expanded, setExpanded] = useState({});
  const [reportDrafts, setReportDrafts] = useState({});
  const [error, setError] = useState('');

  const isClienteSemEmpresa = user?.role === 'cliente' && !user?.empresa_id;
  const canCreate = ['cliente', 'analista', 'gestor'].includes(user?.role) && !isClienteSemEmpresa;
  const canManage = ['analista', 'gestor'].includes(user?.role);
  const isTech = user?.role === 'tecnico';

  const load = () => {
    api.get('/requests').then((res) => setRequests(res.data));
    api.get('/companies').then((res) => setCompanies(res.data)).catch(() => {});
    api.get('/equipments').then((res) => setEquipments(res.data)).catch(() => {});
    if (canManage) {
      api.get('/users').then((res) => setTechnicians(res.data.filter((u) => u.role === 'tecnico'))).catch(() => {});
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const company = (id) => companies.find((c) => c.id === id);
  const equipment = (id) => equipments.find((e) => e.id === id);
  const companyName = (id) => company(id)?.razao_social || '—';
  const equipmentLabel = (id) => {
    const eq = equipment(id);
    return eq ? `${eq.modelo} — ${eq.numero_serie}` : '—';
  };
  const technicianName = (id) => technicians.find((t) => t.id === id)?.nome || (id ? id : 'Não atribuído');

  const handleSubmit = async (e) => {
    e.preventDefault();
    await api.post('/requests', form);
    setForm({ empresa_id: '', equipamento_id: '', descricao: '', endereco: '', urgencia: 'Normal' });
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
          {user?.role !== 'cliente' && (
            <label className="form-field">
              Empresa
              <select className="form-select" value={form.empresa_id} onChange={(e) => setForm({ ...form, empresa_id: e.target.value })} required>
                <option value="">Selecione</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.razao_social}</option>
                ))}
              </select>
            </label>
          )}
          <label className="form-field">
            Equipamento
            <select className="form-select" value={form.equipamento_id} onChange={(e) => setForm({ ...form, equipamento_id: e.target.value })} required>
              <option value="">Selecione</option>
              {equipments.map((eq) => (
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
          {requests.map((req) => {
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
                        {req.relatorio_visita && (
                          <div className="detail-report">
                            <strong>Relatório da visita</strong>
                            <p>{req.relatorio_visita}</p>
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
    </div>
  );
}
