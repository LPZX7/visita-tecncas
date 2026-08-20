import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { getUser, clearAuth } from '../utils/auth';
import { BarTrend, CategoryBars, Sparkline, DonutChart } from '../components/Charts';
import Timeline from '../components/Timeline';
import EmptyState from '../components/EmptyState';
import RatingInput from '../components/RatingInput';
import VisitCalendar from '../components/VisitCalendar';

const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const BUDGET_STATUS_COLOR = {
  'Rascunho': '#94a3b8',
  'Enviado': 'var(--ambar)',
  'Aprovado': 'var(--verde)',
  'Rejeitado': 'var(--vermelho)'
};

const STATUS_GROUPS = [
  { label: 'Aguardando', statuses: ['Aberta', 'Agendada'], color: 'var(--ambar)' },
  { label: 'Realizando', statuses: ['Em Atendimento'], color: 'var(--azul)' },
  { label: 'Concluído', statuses: ['Concluída'], color: 'var(--verde)' },
  { label: 'Cancelado', statuses: ['Cancelada'], color: '#94a3b8' }
];

function groupedStatusCounts(requests) {
  return STATUS_GROUPS
    .map((g) => ({
      label: g.label,
      color: g.color,
      value: requests.filter((r) => g.statuses.includes(r.status)).length
    }))
    .filter((row) => row.value > 0);
}

function countBy(list, key, colorMap) {
  const counts = {};
  list.forEach((item) => {
    counts[item[key]] = (counts[item[key]] || 0) + 1;
  });
  return Object.keys(colorMap)
    .map((label) => ({ label, value: counts[label] || 0, color: colorMap[label] }))
    .filter((row) => row.value > 0);
}

function last14Days() {
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function last14DaysTrend(requests) {
  const days = last14Days();
  const counts = {};
  requests.forEach((r) => {
    const day = (r.criado_em || '').slice(0, 10);
    counts[day] = (counts[day] || 0) + 1;
  });
  return days.map((day) => ({
    label: day.slice(8, 10),
    fullLabel: new Date(day).toLocaleDateString('pt-BR'),
    value: counts[day] || 0
  }));
}

function last14DaysRevenue(budgets) {
  const days = last14Days();
  const sums = {};
  budgets.filter((b) => b.status === 'Aprovado').forEach((b) => {
    const day = (b.atualizado_em || b.criado_em || '').slice(0, 10);
    sums[day] = (sums[day] || 0) + Number(b.total || 0);
  });
  return days.map((day) => sums[day] || 0);
}

const STATUS_BADGE = {
  'Aberta': 'badge-aberta',
  'Agendada': 'badge-agendada',
  'Em Atendimento': 'badge-em-atendimento',
  'Concluída': 'badge-concluida',
  'Cancelada': 'badge-cancelada',
  'Rascunho': 'badge-rascunho',
  'Enviado': 'badge-enviado',
  'Aprovado': 'badge-aprovado',
  'Rejeitado': 'badge-rejeitado'
};

function Badge({ status }) {
  return <span className={`badge ${STATUS_BADGE[status] || ''}`}>{status}</span>;
}

function formatDate(value) {
  if (!value) return null;
  return new Date(value).toLocaleDateString('pt-BR');
}

const CLIENT_FILTERS = [
  { key: 'todos', label: 'Todos' },
  { key: 'andamento', label: 'Em andamento' },
  { key: 'finalizados', label: 'Finalizados' },
  { key: 'cancelados', label: 'Cancelados' }
];

export default function Dashboard() {
  const [metrics, setMetrics] = useState({ requests: 0, budgets: 0, companies: 0, equipments: 0, parts: 0 });
  const [requests, setRequests] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [equipments, setEquipments] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('todos');
  const [selectedDay, setSelectedDay] = useState(null);
  const [calCursor, setCalCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const profile = getUser();
  const navigate = useNavigate();
  const role = profile?.role;
  const today = new Date().toISOString().slice(0, 10);

  const load = async () => {
    setLoading(true);
    try {
      if (role === 'gestor') {
        const [requestsRes, budgetsRes, companiesRes, equipmentsRes, partsRes, usersRes] = await Promise.all([
          api.get('/requests'),
          api.get('/budgets'),
          api.get('/companies'),
          api.get('/equipments'),
          api.get('/parts'),
          api.get('/users')
        ]);
        setRequests(requestsRes.data);
        setBudgets(budgetsRes.data);
        setUsers(usersRes.data);
        setCompanies(companiesRes.data);
        setMetrics({
          requests: requestsRes.data.length,
          budgets: budgetsRes.data.length,
          companies: companiesRes.data.length,
          equipments: equipmentsRes.data.length,
          parts: partsRes.data.length
        });
      } else if (role === 'cliente') {
        const [requestsRes, budgetsRes, companiesRes, equipmentsRes, contractsRes] = await Promise.all([
          api.get('/requests'),
          api.get('/budgets'),
          api.get('/companies'),
          api.get('/equipments'),
          api.get('/contracts')
        ]);
        setRequests(requestsRes.data);
        setBudgets(budgetsRes.data);
        setCompanies(companiesRes.data);
        setEquipments(equipmentsRes.data);
        setContracts(contractsRes.data);
      } else {
        const [requestsRes, budgetsRes] = await Promise.all([api.get('/requests'), api.get('/budgets')]);
        setRequests(requestsRes.data);
        setBudgets(budgetsRes.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  const minhasRequests = requests.filter((r) => r.assigned_technician === profile?.id);
  const agendaHoje = minhasRequests.filter((r) => (r.agendado_para || '').slice(0, 10) === today);
  const emAtendimento = minhasRequests.filter((r) => r.status === 'Em Atendimento');

  const filaTriagem = requests.filter((r) => r.status === 'Aberta');
  const agendadosHoje = requests.filter((r) => (r.agendado_para || '').slice(0, 10) === today);

  const orcamentosPendentes = budgets.filter((b) => b.status === 'Enviado');
  const meusChamados = requests;

  const orcamentosAprovados = budgets.filter((b) => b.status === 'Aprovado');
  const faturamentoAprovado = orcamentosAprovados.reduce((sum, b) => sum + Number(b.total || 0), 0);
  const ticketMedio = orcamentosAprovados.length > 0 ? faturamentoAprovado / orcamentosAprovados.length : 0;
  const currentMonthKey = today.slice(0, 7);
  const aprovadosEsteMes = orcamentosAprovados.filter((b) => (b.atualizado_em || b.criado_em || '').slice(0, 7) === currentMonthKey);
  const faturamentoEsteMes = aprovadosEsteMes.reduce((sum, b) => sum + Number(b.total || 0), 0);

  const chamadosPorStatus = groupedStatusCounts(requests);
  const orcamentosPorStatus = countBy(budgets, 'status', BUDGET_STATUS_COLOR);
  const tendenciaChamados = last14DaysTrend(requests);
  const tendenciaChamadosValores = tendenciaChamados.map((d) => d.value);
  const tendenciaFaturamento = last14DaysRevenue(budgets);
  const chamadosAbertos = requests.filter((r) => !['Concluída', 'Cancelada'].includes(r.status)).length;

  // ---------- calendário de visitas (mês atual) ----------
  const calYear = calCursor.year;
  const calMonth = calCursor.month;
  const isCurrentCalMonth = (() => {
    const d = new Date();
    return d.getFullYear() === calYear && d.getMonth() === calMonth;
  })();

  const goPrevMonth = () => {
    setSelectedDay(null);
    setCalCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }));
  };
  const goNextMonth = () => {
    setSelectedDay(null);
    setCalCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }));
  };
  const goCurrentMonth = () => {
    setSelectedDay(null);
    const d = new Date();
    setCalCursor({ year: d.getFullYear(), month: d.getMonth() });
  };
  const approvedByRequest = {};
  budgets.filter((b) => b.status === 'Aprovado').forEach((b) => {
    approvedByRequest[b.request_id] = (approvedByRequest[b.request_id] || 0) + Number(b.total || 0);
  });

  const monthRequests = requests.filter((r) => {
    const day = (r.agendado_para || '').slice(0, 10);
    if (!day) return false;
    const d = new Date(day);
    return d.getFullYear() === calYear && d.getMonth() === calMonth;
  });

  const userNameById = {};
  users.forEach((u) => { userNameById[u.id] = u.nome; });
  const companyNameById = {};
  companies.forEach((c) => { companyNameById[c.id] = c.razao_social; });

  const calendarDayData = {};
  monthRequests.forEach((r) => {
    const day = r.agendado_para.slice(0, 10);
    if (!calendarDayData[day]) calendarDayData[day] = { count: 0, valor: 0, visits: [] };
    const valor = approvedByRequest[r.id] || 0;
    calendarDayData[day].count += 1;
    calendarDayData[day].valor += valor;
    calendarDayData[day].visits.push({
      id: r.id,
      empresa: companyNameById[r.empresa_id] || 'Empresa não identificada',
      tecnico: userNameById[r.assigned_technician] || 'Não atribuído',
      descricao: r.descricao,
      status: r.status,
      valor
    });
  });

  const daysInCalMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const revenueColumnData = Array.from({ length: daysInCalMonth }, (_, i) => {
    const d = i + 1;
    const key = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const valor = calendarDayData[key]?.valor || 0;
    return { label: String(d).padStart(2, '0'), fullLabel: `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, value: valor };
  });

  const TECH_COLORS = ['var(--azul)', 'var(--verde)', 'var(--ambar)', 'var(--vermelho)', '#8b5cf6', '#0ea5e9', '#f472b6'];
  const visitasPorTecnico = {};
  monthRequests.forEach((r) => {
    if (!r.assigned_technician) return;
    const nome = userNameById[r.assigned_technician] || 'Técnico';
    visitasPorTecnico[nome] = (visitasPorTecnico[nome] || 0) + 1;
  });
  const tecnicoDonutData = Object.entries(visitasPorTecnico)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({ label, value, color: TECH_COLORS[i % TECH_COLORS.length] }));

  // ---------- cliente-specific derived data ----------
  const minhaEmpresa = companies[0] || null;

  const chamadosAbertosCliente = requests.filter((r) => !['Concluída', 'Cancelada'].includes(r.status));
  const concluidos = requests.filter((r) => r.status === 'Concluída' && r.concluded_at);
  const ultimaVisita = concluidos.length
    ? concluidos.reduce((latest, r) => (r.concluded_at > latest ? r.concluded_at : latest), concluidos[0].concluded_at)
    : null;

  const proximaVisita = requests
    .filter((r) => r.agendado_para && !['Concluída', 'Cancelada'].includes(r.status))
    .sort((a, b) => (a.agendado_para || '').localeCompare(b.agendado_para || ''))[0] || null;

  const equipamentosComStatus = equipments.map((eq) => {
    const emManutencao = requests.some((r) => r.equipamento_id === eq.id && ['Aberta', 'Agendada', 'Em Atendimento'].includes(r.status));
    const historico = requests.filter((r) => r.equipamento_id === eq.id && r.status === 'Concluída' && r.concluded_at);
    const ultimaManutencao = historico.length
      ? historico.reduce((latest, r) => (r.concluded_at > latest ? r.concluded_at : latest), historico[0].concluded_at)
      : null;
    return { ...eq, emManutencao, ultimaManutencao };
  });

  const chamadoEmDestaque = [...requests]
    .filter((r) => r.status !== 'Cancelada')
    .sort((a, b) => (b.atualizado_em || '').localeCompare(a.atualizado_em || ''))[0] || null;

  const chamadoParaAvaliar = [...requests]
    .filter((r) => r.status === 'Concluída' && !r.avaliacao)
    .sort((a, b) => (b.concluded_at || '').localeCompare(a.concluded_at || ''))[0] || null;

  const ultimoContrato = contracts[0] || null;
  const ultimoRelatorio = [...requests]
    .filter((r) => r.relatorio_visita)
    .sort((a, b) => (b.hora_checkout || '').localeCompare(a.hora_checkout || ''))[0] || null;

  const filteredChamados = useMemo(() => {
    return requests.filter((r) => {
      if (search && !r.descricao.toLowerCase().includes(search.toLowerCase()) && !String(r.numero).includes(search)) {
        return false;
      }
      if (filter === 'andamento') return !['Concluída', 'Cancelada'].includes(r.status);
      if (filter === 'finalizados') return r.status === 'Concluída';
      if (filter === 'cancelados') return r.status === 'Cancelada';
      return true;
    }).sort((a, b) => b.numero - a.numero);
  }, [requests, search, filter]);

  const submitRating = async (nota, comentario) => {
    if (!chamadoParaAvaliar) return;
    try {
      await api.patch(`/requests/${chamadoParaAvaliar.id}/avaliacao`, { avaliacao: nota, comentario });
      load();
    } catch (err) {
      console.error(err);
    }
  };

  const openPdf = (url) => {
    api.get(url, { responseType: 'blob' }).then((res) => {
      const blobUrl = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(blobUrl, '_blank');
    });
  };

  if (role === 'cliente') {
    return (
      <section className="dashboard-page client-portal">
        <div className="page-header">
          <div>
            <h2 className="page-title">Bem-vindo, {profile?.nome?.split(' ')[0] || 'cliente'}</h2>
            <p className="section-text">Acompanhe seus chamados, orçamentos e equipamentos em um só lugar.</p>
          </div>
          <Link to="/requests" className="btn btn-primary btn-open-chamado">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg>
            Abrir Chamado
          </Link>
        </div>

        {loading && <p className="section-text">Carregando…</p>}

        {!loading && (
          <>
            <div className="stats-grid">
              <div className="metric-card">
                <span>Chamados em aberto</span>
                <strong>{chamadosAbertosCliente.length}</strong>
              </div>
              <div className="metric-card">
                <span>Orçamentos pendentes</span>
                <strong>{orcamentosPendentes.length}</strong>
              </div>
              <div className="metric-card">
                <span>Equipamentos cadastrados</span>
                <strong>{equipments.length}</strong>
              </div>
              <div className="metric-card">
                <span>Última visita</span>
                <strong className="metric-card__date">{formatDate(ultimaVisita) || '—'}</strong>
              </div>
            </div>

            <div className="client-grid">
              <div className="panel-card">
                <h3><SectionIcon name="calendar" /> Próxima visita</h3>
                {proximaVisita ? (
                  <div className="next-visit">
                    <div>
                      <span className="next-visit__label">Data</span>
                      <strong>{formatDate(proximaVisita.agendado_para)}</strong>
                    </div>
                    <div>
                      <span className="next-visit__label">Chamado</span>
                      <strong>#{proximaVisita.numero} — {proximaVisita.descricao}</strong>
                    </div>
                    <div>
                      <span className="next-visit__label">Status</span>
                      <Badge status={proximaVisita.status} />
                    </div>
                  </div>
                ) : (
                  <p className="section-text">Nenhuma visita agendada no momento.</p>
                )}
              </div>

              <div className="panel-card">
                <h3><SectionIcon name="building" /> Informações da unidade</h3>
                {minhaEmpresa ? (
                  <dl className="info-list">
                    <div><dt>Empresa</dt><dd>{minhaEmpresa.razao_social}</dd></div>
                    <div><dt>Endereço</dt><dd>{minhaEmpresa.endereco || '—'}</dd></div>
                    <div><dt>Responsável</dt><dd>{minhaEmpresa.responsavel || '—'}</dd></div>
                    <div><dt>Telefone</dt><dd>{minhaEmpresa.telefone || '—'}</dd></div>
                  </dl>
                ) : (
                  <p className="section-text">Sua conta ainda não está vinculada a uma empresa. Aguarde o contato do gestor.</p>
                )}
              </div>
            </div>

            {chamadoEmDestaque && (
              <div className="panel-card">
                <h3><SectionIcon name="timeline" /> Andamento do chamado #{chamadoEmDestaque.numero}</h3>
                <p className="chart-card__subtitle">{chamadoEmDestaque.descricao}</p>
                <Timeline status={chamadoEmDestaque.status} />
              </div>
            )}

            {chamadoParaAvaliar && (
              <div className="panel-card">
                <h3><SectionIcon name="star" /> Como foi o atendimento?</h3>
                <p className="chart-card__subtitle">Chamado #{chamadoParaAvaliar.numero} — {chamadoParaAvaliar.descricao}</p>
                <RatingInput onSubmit={submitRating} />
              </div>
            )}

            <div className="panel-card">
              <div className="panel-card__header-row">
                <h3><SectionIcon name="list" /> Meus chamados</h3>
                <div className="list-controls">
                  <input
                    className="form-input search-input"
                    placeholder="Pesquisar chamado..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <div className="filter-chips">
                    {CLIENT_FILTERS.map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        className={`filter-chip ${filter === f.key ? 'is-active' : ''}`}
                        onClick={() => setFilter(f.key)}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {filteredChamados.length === 0 ? (
                requests.length === 0 ? (
                  <EmptyState
                    title="Você ainda não abriu nenhum chamado"
                    message="Quando sua catraca precisar de manutenção, abra um chamado por aqui e acompanhe tudo neste painel."
                    actionLabel="Abrir meu primeiro chamado"
                    to="/requests"
                  />
                ) : (
                  <p className="section-text">Nenhum chamado encontrado para essa busca/filtro.</p>
                )
              ) : (
                <table className="data-table">
                  <thead>
                    <tr><th>Nº</th><th>Assunto</th><th>Status</th><th>Data</th></tr>
                  </thead>
                  <tbody>
                    {filteredChamados.slice(0, 8).map((r) => (
                      <tr key={r.id}>
                        <td>#{r.numero}</td>
                        <td>{r.descricao}</td>
                        <td><Badge status={r.status} /></td>
                        <td>{formatDate(r.criado_em)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="client-grid">
              <div className="panel-card">
                <h3><SectionIcon name="wrench" /> Meus equipamentos</h3>
                {equipamentosComStatus.length === 0 ? (
                  <p className="section-text">Nenhum equipamento cadastrado ainda.</p>
                ) : (
                  <ul className="equipment-list">
                    {equipamentosComStatus.map((eq) => (
                      <li key={eq.id}>
                        <div>
                          <strong>{eq.modelo}</strong>
                          <span className="equipment-list__meta">Última manutenção: {formatDate(eq.ultimaManutencao) || 'sem registro'}</span>
                        </div>
                        <span className={`badge ${eq.emManutencao ? 'badge-agendada' : 'badge-ativo'}`}>
                          {eq.emManutencao ? 'Em manutenção' : 'Operando'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="panel-card">
                <h3><SectionIcon name="money" /> Orçamentos</h3>
                {budgets.length === 0 ? (
                  <p className="section-text">Nenhum orçamento por aqui ainda.</p>
                ) : (
                  <ul className="item-list">
                    {budgets.slice(0, 5).map((b) => (
                      <li key={b.id}>
                        <span>R$ {Number(b.total).toFixed(2)}</span>
                        <Badge status={b.status} />
                      </li>
                    ))}
                  </ul>
                )}
                <div style={{ marginTop: 12 }}>
                  <Link to="/budgets" className="btn btn-outline btn-sm">Ver todos os orçamentos</Link>
                </div>
              </div>
            </div>

            <div className="client-grid">
              <div className="panel-card">
                <h3><SectionIcon name="contract" /> Contratos</h3>
                {contracts.length === 0 ? (
                  <p className="section-text">Nenhum contrato gerado ainda — eles aparecem automaticamente quando um orçamento é aprovado.</p>
                ) : (
                  <ul className="item-list">
                    {contracts.slice(0, 3).map((c) => (
                      <li key={c.id}>
                        <span>{c.numero} — R$ {Number(c.valor_total).toFixed(2)}</span>
                        <button className="btn btn-outline btn-sm" onClick={() => openPdf(`/contracts/${c.id}/pdf`)}>PDF</button>
                      </li>
                    ))}
                  </ul>
                )}
                <div style={{ marginTop: 12 }}>
                  <Link to="/contracts" className="btn btn-outline btn-sm">Ver todos os contratos</Link>
                </div>
              </div>

              <div className="panel-card">
                <h3><SectionIcon name="folder" /> Documentos</h3>
                <ul className="doc-list">
                  <li>
                    <span>Contrato mais recente</span>
                    {ultimoContrato ? (
                      <button className="btn btn-outline btn-sm" onClick={() => openPdf(`/contracts/${ultimoContrato.id}/pdf`)}>Baixar</button>
                    ) : <span className="doc-list__empty">indisponível</span>}
                  </li>
                  <li>
                    <span>Último relatório de visita</span>
                    {ultimoRelatorio ? (
                      <button className="btn btn-outline btn-sm" onClick={() => openPdf(`/requests/${ultimoRelatorio.id}/relatorio-pdf`)}>Baixar</button>
                    ) : <span className="doc-list__empty">indisponível</span>}
                  </li>
                  <li>
                    <span>Último orçamento</span>
                    {budgets[0] ? (
                      <button className="btn btn-outline btn-sm" onClick={() => openPdf(`/budgets/${budgets[0].id}/pdf`)}>Baixar</button>
                    ) : <span className="doc-list__empty">indisponível</span>}
                  </li>
                </ul>
              </div>
            </div>
          </>
        )}
      </section>
    );
  }

  return (
    <section className="dashboard-page">
      <div className="page-header">
        <div>
          <span className="page-eyebrow">MIRONTEC · PAINEL DE SERVIÇO</span>
          <h2 className="page-title">Catraca e campo em um só lugar</h2>
          <p className="section-text">Veja chamados, orçamentos e técnicos em movimento. O painel mostra o que está liberado, bloqueado e em atendimento.</p>
        </div>
        <button className="secondary-button" onClick={handleLogout}>Sair</button>
      </div>

      {loading && <p className="section-text">Carregando…</p>}

      {!loading && role === 'gestor' && (
        <div className="stats-grid">
          <div className="metric-card" style={{ '--stagger': 0 }}>
            <div className="metric-card__top">
              <span className="metric-card__icon metric-card__icon--vermelho"><MetricIcon name="ticket" /></span>
              <span className="metric-card__label">Chamados abertos</span>
            </div>
            <strong>{chamadosAbertos}</strong>
            {tendenciaChamadosValores.some((v) => v > 0) && (
              <div className="metric-card__spark"><Sparkline data={tendenciaChamadosValores} color="var(--vermelho)" /></div>
            )}
          </div>
          <div className="metric-card" style={{ '--stagger': 1 }}>
            <div className="metric-card__top">
              <span className="metric-card__icon metric-card__icon--ambar"><MetricIcon name="budget" /></span>
              <span className="metric-card__label">Orçamentos em revisão</span>
            </div>
            <strong>{metrics.budgets}</strong>
          </div>
          <div className="metric-card" style={{ '--stagger': 2 }}>
            <div className="metric-card__top">
              <span className="metric-card__icon metric-card__icon--azul"><MetricIcon name="building" /></span>
              <span className="metric-card__label">Empresas atendidas</span>
            </div>
            <strong>{metrics.companies}</strong>
          </div>
          <div className="metric-card" style={{ '--stagger': 3 }}>
            <div className="metric-card__top">
              <span className="metric-card__icon metric-card__icon--azul"><MetricIcon name="equipment" /></span>
              <span className="metric-card__label">Catracas cadastradas</span>
            </div>
            <strong>{metrics.equipments}</strong>
          </div>
          <div className="metric-card" style={{ '--stagger': 4 }}>
            <div className="metric-card__top">
              <span className="metric-card__icon metric-card__icon--ambar"><MetricIcon name="box" /></span>
              <span className="metric-card__label">Peças no estoque</span>
            </div>
            <strong>{metrics.parts}</strong>
          </div>
          <div className="metric-card metric-card--highlight" style={{ '--stagger': 5 }}>
            <div className="metric-card__top">
              <span className="metric-card__icon metric-card__icon--verde"><MetricIcon name="cash" /></span>
              <span className="metric-card__label">Faturamento aprovado</span>
            </div>
            <strong>R$ {faturamentoAprovado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            {tendenciaFaturamento.some((v) => v > 0) && (
              <div className="metric-card__spark"><Sparkline data={tendenciaFaturamento} color="var(--verde)" /></div>
            )}
          </div>
          <div className="metric-card" style={{ '--stagger': 6 }}>
            <div className="metric-card__top">
              <span className="metric-card__icon metric-card__icon--verde"><MetricIcon name="cash" /></span>
              <span className="metric-card__label">Faturamento este mês</span>
            </div>
            <strong>R$ {faturamentoEsteMes.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            <span className="metric-card__sublabel">{aprovadosEsteMes.length} orçamento{aprovadosEsteMes.length === 1 ? '' : 's'} aprovado{aprovadosEsteMes.length === 1 ? '' : 's'}</span>
          </div>
          <div className="metric-card" style={{ '--stagger': 7 }}>
            <div className="metric-card__top">
              <span className="metric-card__icon metric-card__icon--azul"><MetricIcon name="cash" /></span>
              <span className="metric-card__label">Ticket médio aprovado</span>
            </div>
            <strong>R$ {ticketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
          </div>
        </div>
      )}

      {!loading && role === 'gestor' && (
        <div className="charts-grid">
          <div className="chart-card">
            <h3>Chamados nos últimos 14 dias</h3>
            <p className="chart-card__subtitle">Novos chamados abertos por dia</p>
            {tendenciaChamados.every((d) => d.value === 0) ? (
              <p className="section-text">Nenhum chamado registrado no período.</p>
            ) : (
              <BarTrend data={tendenciaChamados} />
            )}
          </div>
          <div className="chart-card">
            <h3>Chamados por status</h3>
            <p className="chart-card__subtitle">Distribuição de todos os chamados</p>
            {chamadosPorStatus.length === 0 ? (
              <p className="section-text">Nenhum chamado cadastrado.</p>
            ) : (
              <CategoryBars data={chamadosPorStatus} />
            )}
          </div>
          <div className="chart-card">
            <h3>Orçamentos por status</h3>
            <p className="chart-card__subtitle">Distribuição de todos os orçamentos</p>
            {orcamentosPorStatus.length === 0 ? (
              <p className="section-text">Nenhum orçamento cadastrado.</p>
            ) : (
              <CategoryBars data={orcamentosPorStatus} />
            )}
          </div>
        </div>
      )}

      {!loading && role === 'gestor' && (
        <div className="panel-card panel-card--calendar">
          <div className="panel-card__header-row">
            <div>
              <h3><SectionIcon name="calendar" /> Calendário de visitas</h3>
              <p className="chart-card__subtitle">
                {monthRequests.length === 0
                  ? `Nenhuma visita agendada em ${MONTH_NAMES[calMonth]} ainda.`
                  : 'Clique em um dia com visita para ver os detalhes.'}
              </p>
            </div>
            <div className="calendar-nav">
              <button type="button" className="calendar-nav__btn" onClick={goPrevMonth} aria-label="Mês anterior">‹</button>
              <span className="calendar-nav__label">{MONTH_NAMES[calMonth]} {calYear}</span>
              <button type="button" className="calendar-nav__btn" onClick={goNextMonth} aria-label="Próximo mês">›</button>
              {!isCurrentCalMonth && (
                <button type="button" className="calendar-nav__today" onClick={goCurrentMonth}>Hoje</button>
              )}
            </div>
          </div>
          <VisitCalendar year={calYear} month={calMonth} dayData={calendarDayData} onDayClick={setSelectedDay} selectedKey={selectedDay} />

          {selectedDay && calendarDayData[selectedDay] && (
            <div className="day-detail">
              <div className="day-detail__header">
                <strong>{new Date(selectedDay).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</strong>
                <button type="button" className="day-detail__close" onClick={() => setSelectedDay(null)} aria-label="Fechar">×</button>
              </div>
              <ul className="day-detail__list">
                {calendarDayData[selectedDay].visits.map((v) => (
                  <li key={v.id}>
                    <div>
                      <strong>{v.empresa}</strong>
                      <span className="day-detail__meta">{v.descricao} · Técnico: {v.tecnico}</span>
                    </div>
                    <div className="day-detail__right">
                      <span className="day-detail__valor">{v.valor > 0 ? `R$ ${v.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'sem orçamento aprovado'}</span>
                      <Badge status={v.status} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {!loading && role === 'gestor' && (
        <div className="charts-grid charts-grid--split">
          <div className="chart-card">
            <h3>Faturamento aprovado por dia</h3>
            <p className="chart-card__subtitle">Valor aprovado por dia em {MONTH_NAMES[calMonth]}</p>
            <BarTrend data={revenueColumnData} color="var(--verde)" />
          </div>
          <div className="chart-card">
            <h3>Técnicos em campo</h3>
            <p className="chart-card__subtitle">
              {tecnicoDonutData.length === 0
                ? `Nenhum técnico foi para a rua em ${MONTH_NAMES[calMonth]} ainda.`
                : `Visitas realizadas por técnico em ${MONTH_NAMES[calMonth]}`}
            </p>
            <DonutChart data={tecnicoDonutData} />
          </div>
        </div>
      )}

      {!loading && role === 'analista' && (
        <>
          <div className="panel-card">
            <h3>Fila de triagem</h3>
            <p className="section-text">Chamados novos aguardando classificação e agendamento.</p>
            {filaTriagem.length === 0 ? (
              <p className="section-text">Nenhum chamado aberto no momento.</p>
            ) : (
              <ul className="item-list">
                {filaTriagem.map((r) => (
                  <li key={r.id}><span>{r.descricao}</span> <Badge status={r.status} /></li>
                ))}
              </ul>
            )}
          </div>
          <div className="panel-card" style={{ marginTop: 16 }}>
            <h3>Chamados agendados hoje</h3>
            {agendadosHoje.length === 0 ? (
              <p className="section-text">Nenhuma visita agendada para hoje.</p>
            ) : (
              <ul className="item-list">
                {agendadosHoje.map((r) => (
                  <li key={r.id}><span>{r.descricao}</span> <Badge status={r.status} /></li>
                ))}
              </ul>
            )}
          </div>
          {orcamentosPendentes.length > 0 && (
            <div className="panel-card" style={{ marginTop: 16 }}>
              <h3>Orçamentos aguardando cliente</h3>
              <ul className="item-list">
                {orcamentosPendentes.map((b) => (
                  <li key={b.id}><span>R$ {Number(b.total).toFixed(2)}</span> <Badge status={b.status} /></li>
                ))}
              </ul>
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <Link to="/requests" className="btn btn-outline">Ver todos os chamados</Link>
          </div>
        </>
      )}

      {!loading && role === 'tecnico' && (
        <>
          <div className="panel-card">
            <h3>Agenda do dia</h3>
            <p className="section-text">Visitas agendadas para hoje.</p>
            {agendaHoje.length === 0 ? (
              <p className="section-text">Nenhuma visita agendada para hoje.</p>
            ) : (
              <ul className="item-list">
                {agendaHoje.map((r) => (
                  <li key={r.id}><span>{r.descricao} — {r.endereco || 'sem endereço'}</span> <Badge status={r.status} /></li>
                ))}
              </ul>
            )}
          </div>
          <div className="panel-card" style={{ marginTop: 16 }}>
            <h3>Em atendimento</h3>
            {emAtendimento.length === 0 ? (
              <p className="section-text">Nenhum chamado em atendimento no momento.</p>
            ) : (
              <ul className="item-list">
                {emAtendimento.map((r) => (
                  <li key={r.id}><span>{r.descricao}</span> <Badge status={r.status} /></li>
                ))}
              </ul>
            )}
          </div>
          <div style={{ marginTop: 16 }}>
            <Link to="/requests" className="btn btn-outline">Ver meus chamados</Link>
          </div>
        </>
      )}
    </section>
  );
}

function MetricIcon({ name }) {
  const paths = {
    ticket: <><path d="M3 8a2 2 0 012-2h14a2 2 0 012 2v2a2 2 0 000 4v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2a2 2 0 000-4V8z" /><path d="M10 6v12" strokeDasharray="2 2" /></>,
    budget: <><rect x="2.5" y="6" width="19" height="13" rx="2.5" /><circle cx="12" cy="12.5" r="3" /></>,
    building: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h2M14 8h2M8 12h2M14 12h2M8 16h2M14 16h2" /></>,
    equipment: <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="12" cy="12" r="4" /></>,
    box: <><path d="M12 2.5l8.5 4.9v9.2L12 21.5l-8.5-4.9V7.4L12 2.5z" /><path d="M12 21.5v-9M3.5 7.4L12 12.5l8.5-5.1" /></>,
    cash: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M6 9v0M18 15v0" /></>
  };
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

function SectionIcon({ name }) {
  const paths = {
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.4" /><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></>,
    building: <><rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="1.4" /><path d="M8 8h2M14 8h2M8 12h2M14 12h2M8 16h2M14 16h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></>,
    timeline: <><path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><circle cx="4" cy="6" r="1.6" fill="currentColor" /><circle cx="4" cy="12" r="1.6" fill="currentColor" /><circle cx="4" cy="18" r="1.6" fill="currentColor" /></>,
    star: <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />,
    list: <><path d="M8 6h13M8 12h13M8 18h13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><circle cx="3.5" cy="6" r="1.3" fill="currentColor" /><circle cx="3.5" cy="12" r="1.3" fill="currentColor" /><circle cx="3.5" cy="18" r="1.3" fill="currentColor" /></>,
    wrench: <path d="M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.6 2.6-2-2 2.6-2.6z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />,
    money: <><rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" /><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.4" /></>,
    contract: <><path d="M7 3h8l4 4v14H7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M10 12h6M10 16h6M10 8h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></>,
    folder: <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  };
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="section-icon">
      {paths[name]}
    </svg>
  );
}
