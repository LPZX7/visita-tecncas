import { Fragment, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../api';
import { getUser } from '../utils/auth';
import MapLink from '../components/MapLink';
import SearchableSelect from '../components/SearchableSelect';
import Pagination from '../components/Pagination';
import TechnicalRecord from '../components/TechnicalRecord';

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
  const location = useLocation();
  const [requests, setRequests] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [units, setUnits] = useState([]);
  const [equipments, setEquipments] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [analysts, setAnalysts] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [parts, setParts] = useState([]);
  const [form, setForm] = useState({ empresa_id: '', unidade_id: '', equipamento_id: '', descricao: '', endereco: '', urgencia: 'Normal', solicitante_email: '' });
  const [drafts, setDrafts] = useState({});
  const [expanded, setExpanded] = useState({});
  const [checkoutRequest, setCheckoutRequest] = useState(null);
  const [checkoutSaving, setCheckoutSaving] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState({
    teve_adicional: null,
    adicional_descricao: '',
    custo_adicional: '',
    observacao_final: '',
    confirmar_conclusao: false
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [milvusDrafts, setMilvusDrafts] = useState({});
  const [milvusSaving, setMilvusSaving] = useState('');
  const [page, setPage] = useState(1);
  const [liberado, setLiberado] = useState(null);
  const [checkingLiberacao, setCheckingLiberacao] = useState(false);
  const [highlightedRequestId, setHighlightedRequestId] = useState('');

  const isClienteSemEmpresa = user?.role === 'cliente' && !user?.empresa_id;
  const canCreate = ['cliente', 'analista', 'gestor'].includes(user?.role) && !isClienteSemEmpresa;
  const isCliente = user?.role === 'cliente';
  const suporteLink = `https://wa.me/5511997488664?text=${encodeURIComponent('Olá, preciso de suporte.')}`;
  const canManage = ['analista', 'gestor'].includes(user?.role);
  const isTech = user?.role === 'tecnico';
  const isGestor = user?.role === 'gestor';

  const checkLiberacao = () => {
    if (!isCliente) return;
    setCheckingLiberacao(true);
    api.get('/users/me').then((res) => setLiberado(!!res.data.liberado_para_chamado)).catch(() => {}).finally(() => setCheckingLiberacao(false));
  };

  const load = () => {
    api.get('/requests').then((res) => setRequests(res.data));
    api.get('/companies').then((res) => setCompanies(res.data)).catch(() => {});
    api.get('/units').then((res) => setUnits(res.data)).catch(() => {});
    api.get('/equipments').then((res) => setEquipments(res.data)).catch(() => {});
    if (canManage) {
      api.get('/users').then((res) => {
        setTechnicians(res.data.filter((u) => u.role === 'tecnico'));
        setAnalysts(res.data.filter((u) => u.role === 'analista'));
      }).catch(() => {});
    }
    api.get('/budgets').then((res) => setBudgets(res.data)).catch(() => {});
    if (isTech) {
      api.get('/parts').then((res) => setParts(res.data)).catch(() => {});
    }
    checkLiberacao();
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const targetId = location.hash.startsWith('#request-') ? location.hash.slice('#request-'.length) : '';
    if (!targetId || requests.length === 0) return undefined;
    const requestIndex = requests.findIndex((request) => request.id === targetId);
    if (requestIndex < 0) return undefined;

    setPage(Math.floor(requestIndex / PAGE_SIZE) + 1);
    setExpanded((current) => ({ ...current, [targetId]: true }));
    setHighlightedRequestId(targetId);
    const scrollTimer = window.setTimeout(() => {
      document.getElementById(`request-${targetId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    const highlightTimer = window.setTimeout(() => setHighlightedRequestId(''), 3500);
    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(highlightTimer);
    };
  }, [location.hash, requests]);

  useEffect(() => {
    if (user?.role !== 'cliente' || !user?.empresa_id || (companies.length === 0 && units.length === 0)) return;
    const address = form.endereco || addressFor(user.empresa_id, user.unidade_id);
    const contactEmail = form.solicitante_email || contactEmailFor(user.empresa_id, user.unidade_id) || user.email || '';
    if (address !== form.endereco || contactEmail !== form.solicitante_email) {
      setForm((current) => ({ ...current, endereco: address, solicitante_email: contactEmail }));
    }
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
  const technicianName = (id) => {
    const technician = technicians.find((item) => item.id === id);
    return technician?.milvus_nome || technician?.nome || (id ? id : 'Não atribuído');
  };
  const analystName = (id) => {
    const analyst = analysts.find((item) => item.id === id);
    return analyst?.milvus_nome || analyst?.nome || (id ? id : 'Não atribuído');
  };
  const partName = (id) => parts.find((p) => p.id === id)?.nome || 'Peça';
  const latestBudgetFor = (requestId) => budgets.find((b) => b.request_id === requestId) || null;
  const approvedBudgetFor = (requestId) => budgets.find((b) => b.request_id === requestId && b.status === 'Aprovado');

  const unitsForCompany = (empresaId) => units.filter((u) => u.empresa_id === empresaId);

  const addressFor = (empresaId, unidadeId) => {
    const u = unidadeId ? unit(unidadeId) : null;
    if (u) return [u.endereco, u.numero, u.bairro, u.cidade && u.estado ? `${u.cidade}/${u.estado}` : u.cidade].filter(Boolean).join(', ');
    const c = company(empresaId);
    return c?.endereco || '';
  };

  const contactEmailFor = (empresaId, unidadeId) => {
    const u = unidadeId ? unit(unidadeId) : null;
    return u?.email || company(empresaId)?.email || '';
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
    setError('');
    setSuccess('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.solicitante_email || '')) {
      setError('Informe um e-mail válido do cliente para registrar o chamado no Milvus.');
      return;
    }
    try {
      const res = await api.post('/requests', form);
      const resetEndereco = user?.role === 'cliente' ? addressFor(user.empresa_id, user.unidade_id) : '';
      const resetEmail = user?.role === 'cliente' ? contactEmailFor(user.empresa_id, user.unidade_id) || user.email || '' : '';
      setForm({ empresa_id: '', unidade_id: '', equipamento_id: '', descricao: '', endereco: resetEndereco, urgencia: 'Normal', solicitante_email: resetEmail });
      setSuccess(res.data.email_confirmacao_enviado
        ? `Chamado criado e vinculado ao Milvus #${res.data.milvus_codigo}. A confirmação foi enviada por e-mail.`
        : `Chamado criado e vinculado ao Milvus #${res.data.milvus_codigo}. O e-mail foi registrado no ticket; o envio direto aguarda a configuração do domínio remetente.`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao abrir chamado');
      load();
    }
  };

  const milvusDraftFor = (req) => milvusDrafts[req.id] ?? req.solicitante_email ?? company(req.empresa_id)?.email ?? '';

  const connectToMilvus = async (req) => {
    const solicitanteEmail = milvusDraftFor(req).trim();
    setError('');
    setSuccess('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(solicitanteEmail)) {
      setError('Informe um e-mail válido para criar este chamado no Milvus.');
      return;
    }
    setMilvusSaving(req.id);
    try {
      const res = await api.post(`/requests/${req.id}/milvus`, { solicitante_email: solicitanteEmail });
      setSuccess(res.data.email_confirmacao_enviado
        ? `Chamado #${req.numero} vinculado ao Milvus #${res.data.milvus_codigo}. O cliente recebeu a confirmação por e-mail.`
        : `Chamado #${req.numero} vinculado ao Milvus #${res.data.milvus_codigo}. O e-mail foi registrado no ticket; o envio direto aguarda a configuração do domínio remetente.`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível criar o chamado no Milvus.');
    } finally {
      setMilvusSaving('');
    }
  };

  const draftFor = (req) => drafts[req.id] || {
    status: req.status,
    assigned_analyst: req.assigned_analyst || '',
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
      assigned_analyst: draft.assigned_analyst || null,
      assigned_technician: draft.assigned_technician || null,
      agendado_para: draft.agendado_para || null,
      sincronizar_responsaveis_milvus: true
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

  const handleCheckin = async (req) => {
    setError('');
    try {
      await api.patch(`/requests/${req.id}`, { status: 'Em Atendimento' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao iniciar visita');
    }
  };

  const openCheckout = (req) => {
    setError('');
    setCheckoutRequest(req);
    setCheckoutForm({
      teve_adicional: null,
      adicional_descricao: '',
      custo_adicional: '',
      observacao_final: '',
      confirmar_conclusao: false
    });
  };

  const closeCheckout = () => {
    if (checkoutSaving) return;
    setCheckoutRequest(null);
  };

  const handleCheckout = async (e) => {
    e.preventDefault();
    setError('');
    if (checkoutForm.teve_adicional === null) {
      setError('Responda se houve peça extra ou custo adicional.');
      return;
    }
    if (checkoutForm.teve_adicional && !checkoutForm.adicional_descricao.trim()) {
      setError('Descreva qual peça extra foi usada ou qual custo adicional ocorreu.');
      return;
    }
    if (!checkoutForm.confirmar_conclusao) {
      setError('Confirme que a visita foi concluída antes de encerrar o chamado.');
      return;
    }
    setCheckoutSaving(true);
    try {
      await api.patch(`/requests/${checkoutRequest.id}`, {
        status: 'Concluída',
        teve_adicional: checkoutForm.teve_adicional,
        adicional_descricao: checkoutForm.teve_adicional ? checkoutForm.adicional_descricao.trim() : null,
        custo_adicional: checkoutForm.teve_adicional ? Number(checkoutForm.custo_adicional || 0) : 0,
        observacao_final: checkoutForm.observacao_final.trim() || null
      });
      setCheckoutRequest(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao concluir visita');
    } finally {
      setCheckoutSaving(false);
    }
  };

  return (
    <div>
      <h2 className="page-title">Chamados</h2>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success" role="status">{success}</div>}

      {isClienteSemEmpresa && (
        <div className="alert alert-error" style={{ marginBottom: 20 }}>
          Sua conta ainda não está vinculada a uma empresa. Aguarde o contato do gestor para começar a abrir chamados.
        </div>
      )}

      {canCreate && isCliente && !liberado && (
        <div className="card-form">
          <h3>Antes de abrir um chamado</h3>
          <p className="section-text">
            Muitas vezes conseguimos resolver o seu problema direto pelo suporte, sem precisar de uma visita técnica. Fale com a gente primeiro — nossa equipe libera a abertura do chamado pra você assim que a conversa terminar.
          </p>
          <div className="row-actions">
            <a href={suporteLink} target="_blank" rel="noopener noreferrer" className="btn btn-primary">Falar com o suporte no WhatsApp</a>
            <button type="button" className="btn btn-outline" onClick={checkLiberacao} disabled={checkingLiberacao}>
              {checkingLiberacao ? 'Verificando...' : 'Já fui liberado, verificar de novo'}
            </button>
          </div>
        </div>
      )}

      {canCreate && (!isCliente || liberado) && (
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
                  onChange={(id) => setForm({ ...form, empresa_id: id, unidade_id: '', equipamento_id: '', endereco: addressFor(id, ''), solicitante_email: contactEmailFor(id, '') })}
                  placeholder="Digite para buscar a empresa..."
                  options={companies.map((c) => ({ value: c.id, label: c.nome_fantasia || c.razao_social, sublabel: [c.razao_social, c.cnpj].filter(Boolean).join(' · ') }))}
                />
              </label>
              {form.empresa_id && unitsForCompany(form.empresa_id).length > 0 && (
                <label className="form-field">
                  Filial / Sede
                  <SearchableSelect
                    value={form.unidade_id}
                    onChange={(id) => setForm({ ...form, unidade_id: id, equipamento_id: '', endereco: addressFor(form.empresa_id, id), solicitante_email: contactEmailFor(form.empresa_id, id) || form.solicitante_email })}
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
            E-mail do cliente
            <input
              className="form-input"
              type="email"
              value={form.solicitante_email}
              onChange={(e) => setForm({ ...form, solicitante_email: e.target.value })}
              placeholder="cliente@empresa.com.br"
              autoComplete="email"
              required
            />
            <small className="detail-muted">Obrigatório. Será usado no chamado do Milvus e nas confirmações do atendimento.</small>
          </label>
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
            <th>Milvus</th>
            <th>Status</th>
            <th>Responsáveis</th>
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
            const latestBudget = latestBudgetFor(req.id);
            return (
              <Fragment key={req.id}>
                <tr id={`request-${req.id}`} className={highlightedRequestId === req.id ? 'request-row--highlighted' : ''}>
                  <td>{req.descricao}</td>
                  <td>{companyName(req.empresa_id)}</td>
                  <td>{equipmentLabel(req.equipamento_id)}</td>
                  <td>{req.milvus_codigo ? <span className="badge badge-aprovado">#{req.milvus_codigo}</span> : <span className="badge badge-rejeitado">Não vinculado</span>}</td>
                  <td><span className={badgeClass(req.status)}>{req.status}</span></td>
                  <td>
                    <span className="request-assignee"><small>Analista</small>{analystName(req.assigned_analyst)}</span>
                    <span className="request-assignee"><small>Técnico</small>{technicianName(req.assigned_technician)}</span>
                  </td>
                  <td>
                    <button className="btn btn-outline btn-sm" onClick={() => toggleExpanded(req.id)}>
                      {isOpen ? 'Ocultar' : 'Detalhes'}
                    </button>
                  </td>
                  {canManage && (
                    <td>
                      <div className="row-actions">
                        <div className="request-assignment-fields">
                          <label>
                            <span>Analista no Milvus</span>
                            <select className="form-select" value={draft.assigned_analyst} onChange={(e) => setDraft(req, { assigned_analyst: e.target.value })}>
                              <option value="">Sem analista</option>
                              {analysts.filter((analyst) => analyst.ativo && analyst.milvus_email && analyst.milvus_nome).map((analyst) => (
                                <option key={analyst.id} value={analyst.id}>{analyst.milvus_nome}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <span>Técnico no Milvus</span>
                            <select className="form-select" value={draft.assigned_technician} onChange={(e) => setDraft(req, { assigned_technician: e.target.value })}>
                              <option value="">Sem técnico</option>
                              {technicians.filter((tech) => tech.ativo && tech.milvus_email && tech.milvus_nome).map((tech) => (
                                <option key={tech.id} value={tech.id}>{tech.milvus_nome}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <input className="form-input" type="date" value={draft.agendado_para ? draft.agendado_para.slice(0, 10) : ''} onChange={(e) => setDraft(req, { agendado_para: e.target.value })} />
                        <select className="form-select" value={draft.status} onChange={(e) => setDraft(req, { status: e.target.value })}>
                          {STAFF_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
                        </select>
                        <button className="btn btn-primary btn-sm" onClick={() => saveManaged(req)}>Salvar e sincronizar</button>
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
                        <button className="btn btn-primary btn-sm" onClick={() => openCheckout(req)}>Finalizar atendimento</button>
                      ) : req.aprovacao_cliente !== 'aprovado' ? (
                        <span className="badge badge-enviado">Aguardando aprovação do orçamento</span>
                      ) : (
                        <button className="btn btn-outline btn-sm" onClick={() => handleCheckin(req)}>Iniciar visita (check-in)</button>
                      )}
                    </td>
                  )}
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={(canManage || isTech) ? 8 : 7}>
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
                            <strong>Orçamento e visita</strong>
                            <p>
                              {req.aprovacao_cliente === 'aprovado' && <span className="badge badge-aprovado">Orçamento aprovado · visita autorizada</span>}
                              {req.aprovacao_cliente === 'recusado' && <span className="badge badge-rejeitado">Orçamento recusado</span>}
                              {!req.aprovacao_cliente && latestBudget?.status === 'Enviado' && <span className="badge badge-enviado">Aguardando aprovação do orçamento</span>}
                              {!req.aprovacao_cliente && latestBudget?.status === 'Rascunho' && <span className="badge badge-agendada">Orçamento em preparação</span>}
                              {!req.aprovacao_cliente && latestBudget?.status === 'Rejeitado' && <span className="badge badge-rejeitado">Orçamento recusado</span>}
                              {!req.aprovacao_cliente && !latestBudget && <span className="badge badge-enviado">Aguardando orçamento</span>}
                            </p>
                            {req.aprovacao_cliente === 'aprovado' && req.aprovacao_nome && (canManage || isTech) && (
                              <p className="detail-muted">
                                Por: {req.aprovacao_nome} — CPF {req.aprovacao_cpf} — Tel {req.aprovacao_telefone}
                              </p>
                            )}
                          </div>
                          <div>
                            <strong>Chamado no Milvus</strong>
                            <p>{req.milvus_codigo ? `#${req.milvus_codigo}` : 'Ainda não vinculado'}</p>
                            {req.solicitante_email && <p className="detail-muted">Contato: {req.solicitante_email}</p>}
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
                        {canManage && !req.milvus_codigo && (
                          <div className="milvus-link-card">
                            <div>
                              <span className="page-eyebrow">AÇÃO NECESSÁRIA</span>
                              <strong>Criar este chamado no Milvus</strong>
                              <p>Informe o e-mail do cliente. O sistema criará o ticket, salvará o número aqui e registrará o contato para as notificações.</p>
                            </div>
                            <label className="form-field">
                              E-mail do cliente
                              <input
                                className="form-input"
                                type="email"
                                value={milvusDraftFor(req)}
                                onChange={(e) => setMilvusDrafts((current) => ({ ...current, [req.id]: e.target.value }))}
                                placeholder="cliente@empresa.com.br"
                              />
                            </label>
                            <button type="button" className="btn btn-primary" onClick={() => connectToMilvus(req)} disabled={milvusSaving === req.id}>
                              {milvusSaving === req.id ? 'Criando no Milvus...' : 'Criar e vincular'}
                            </button>
                          </div>
                        )}
                        {isTech && approvedBudgetFor(req.id) && (
                          <div className="detail-report">
                            <strong>Serviço aprovado pelo cliente</strong>
                            {approvedBudgetFor(req.id).items?.length ? (
                              <p>Peças previstas: {approvedBudgetFor(req.id).items.map((item) => partName(item.peca_id)).join(', ')}</p>
                            ) : (
                              <p>Sem substituição de peça prevista — cobrança somente da visita técnica.</p>
                            )}
                            {approvedBudgetFor(req.id).motivo_troca && <p>Motivo da troca: {approvedBudgetFor(req.id).motivo_troca}</p>}
                            {approvedBudgetFor(req.id).observacoes_tecnicas && <p>Informações relevantes: {approvedBudgetFor(req.id).observacoes_tecnicas}</p>}
                          </div>
                        )}
                        {user?.role === 'cliente' && !req.aprovacao_cliente && (
                          <div className="detail-report">
                            <strong>A autorização da visita acontece pelo orçamento</strong>
                            <p>{latestBudget?.status === 'Enviado' ? 'O orçamento está pronto. Revise os valores e aprove para autorizar a visita.' : 'Aguarde a equipe preparar e enviar o orçamento. Depois disso, você poderá aprovar o orçamento e a visita juntos.'}</p>
                            {latestBudget?.status === 'Enviado' && (
                              <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate('/budgets')}>Revisar orçamento</button>
                            )}
                          </div>
                        )}
                        {req.relatorio_visita && (
                          <div className="detail-report">
                            <strong>Registro técnico da visita</strong>
                            <TechnicalRecord value={req.registro_tecnico || req.relatorio_visita} />
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

      {checkoutRequest && (
        <div className="checkout-modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && closeCheckout()}>
          <form className="checkout-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="checkout-title" onSubmit={handleCheckout}>
            <div className="checkout-modal__header">
              <div>
                <span className="checkout-modal__eyebrow">FINALIZAÇÃO ASSISTIDA</span>
                <h3 id="checkout-title">Como foi o atendimento?</h3>
                <p>Responda só o necessário. O sistema monta o resumo, registra no Milvus e envia ao contato do chamado.</p>
              </div>
              <button type="button" className="checkout-modal__close" onClick={closeCheckout} aria-label="Fechar">×</button>
            </div>

            <div className="checkout-modal__body">
              <div className="checkout-auto-summary">
                <strong>Resumo automático</strong>
                <p>
                  O sistema usará os dados já aprovados no chamado e as peças previstas
                  {approvedBudgetFor(checkoutRequest.id)?.items?.length
                    ? `: ${approvedBudgetFor(checkoutRequest.id).items.map((item) => `${partName(item.peca_id)}${item.quantidade > 1 ? ` (x${item.quantidade})` : ''}`).join(', ')}.`
                    : '.'}
                </p>
              </div>

              <fieldset className="checkout-question checkout-question--choice">
                <legend><b>1.</b> Foi usada alguma peça a mais ou houve outro custo?</legend>
                <div className="checkout-choice-grid">
                  <label className={`checkout-choice ${checkoutForm.teve_adicional === true ? 'checkout-choice--active' : ''}`}>
                    <input type="radio" name="teve_adicional" checked={checkoutForm.teve_adicional === true} onChange={() => setCheckoutForm({ ...checkoutForm, teve_adicional: true })} />
                    <span><strong>Sim</strong><small>Quero informar um adicional</small></span>
                  </label>
                  <label className={`checkout-choice ${checkoutForm.teve_adicional === false ? 'checkout-choice--active' : ''}`}>
                    <input type="radio" name="teve_adicional" checked={checkoutForm.teve_adicional === false} onChange={() => setCheckoutForm({ ...checkoutForm, teve_adicional: false, adicional_descricao: '', custo_adicional: '' })} />
                    <span><strong>Não</strong><small>Não houve valor nem peça extra</small></span>
                  </label>
                </div>
              </fieldset>

              {checkoutForm.teve_adicional === true && (
                <div className="checkout-additional-fields">
                  <label className="form-field">
                    Qual peça ou custo adicional?
                    <textarea
                      className="form-textarea"
                      rows="3"
                      placeholder="Ex.: 1 cabo de alimentação que não estava no orçamento."
                      value={checkoutForm.adicional_descricao}
                      onChange={(e) => setCheckoutForm({ ...checkoutForm, adicional_descricao: e.target.value })}
                      required
                    />
                  </label>
                  <label className="form-field">
                    Valor adicional (R$)
                    <input
                      className="form-input"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      placeholder="0,00"
                      value={checkoutForm.custo_adicional}
                      onChange={(e) => setCheckoutForm({ ...checkoutForm, custo_adicional: e.target.value })}
                    />
                    <small className="checkout-field-help">Se for apenas uma peça sem valor definido, pode deixar em zero.</small>
                  </label>
                </div>
              )}

              {checkoutForm.teve_adicional !== null && (
                <label className="form-field checkout-question">
                  <span><b>2.</b> Quer deixar alguma observação? <small>(opcional)</small></span>
                  <textarea
                    className="form-textarea"
                    rows="3"
                    placeholder="Ex.: Cliente acompanhou os testes e o equipamento ficou funcionando normalmente."
                    value={checkoutForm.observacao_final}
                    onChange={(e) => setCheckoutForm({ ...checkoutForm, observacao_final: e.target.value })}
                  />
                </label>
              )}

              {checkoutForm.teve_adicional !== null && (
                <label className={`checkout-confirm ${checkoutForm.confirmar_conclusao ? 'checkout-confirm--active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checkoutForm.confirmar_conclusao}
                    onChange={(e) => setCheckoutForm({ ...checkoutForm, confirmar_conclusao: e.target.checked })}
                  />
                  <span>
                    <strong>Confirmo que a visita foi concluída com sucesso</strong>
                    <small>Ao confirmar, o chamado será encerrado no site e no Milvus.</small>
                  </span>
                </label>
              )}
            </div>

            <div className="checkout-modal__footer">
              <button type="button" className="btn btn-outline" onClick={closeCheckout} disabled={checkoutSaving}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={checkoutSaving || checkoutForm.teve_adicional === null || !checkoutForm.confirmar_conclusao}>
                {checkoutSaving ? 'Finalizando e enviando...' : 'Confirmar e finalizar atendimento'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
