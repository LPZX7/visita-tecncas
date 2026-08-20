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
  const [checkoutRequest, setCheckoutRequest] = useState(null);
  const [checkoutSaving, setCheckoutSaving] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState({
    teve_adicional: null,
    adicional_descricao: '',
    custo_adicional: '',
    observacao_final: '',
    confirmar_conclusao: false
  });
  const [aprovacaoDrafts, setAprovacaoDrafts] = useState({});
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [liberado, setLiberado] = useState(null);
  const [checkingLiberacao, setCheckingLiberacao] = useState(false);

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
      api.get('/users').then((res) => setTechnicians(res.data.filter((u) => u.role === 'tecnico'))).catch(() => {});
    }
    if (isTech) {
      api.get('/budgets').then((res) => setBudgets(res.data)).catch(() => {});
      api.get('/parts').then((res) => setParts(res.data)).catch(() => {});
    }
    checkLiberacao();
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
    setError('');
    try {
      await api.post('/requests', form);
      const resetEndereco = user?.role === 'cliente' ? addressFor(user.empresa_id, user.unidade_id) : '';
      setForm({ empresa_id: '', unidade_id: '', equipamento_id: '', descricao: '', endereco: resetEndereco, urgencia: 'Normal' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao abrir chamado');
      load();
    }
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
                        <button className="btn btn-primary btn-sm" onClick={() => openCheckout(req)}>Finalizar atendimento</button>
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
                            <p>Peça ou custo adicional: {req.teve_adicional ? 'Sim' : 'Não'}</p>
                            {req.teve_adicional && req.adicional_descricao && <p>Adicional informado: {req.adicional_descricao}</p>}
                            {req.teve_adicional && <p>Valor adicional: {Number(req.custo_adicional || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>}
                            {req.observacao_final && <p>Observação do técnico: {req.observacao_final}</p>}
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
