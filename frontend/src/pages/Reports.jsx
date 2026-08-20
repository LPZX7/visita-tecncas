import { useEffect, useMemo, useState } from 'react';
import api from '../api';

const PERIODS = [
  { value: 'todos', label: 'Todo o período' },
  { value: 'mes', label: 'Este mês' },
  { value: '90dias', label: 'Últimos 90 dias' },
  { value: 'ano', label: 'Este ano' }
];

const SECTIONS = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'companies', label: 'Empresas' },
  { id: 'branches', label: 'Filiais' },
  { id: 'technicians', label: 'Técnicos' },
  { id: 'requests', label: 'Chamados' },
  { id: 'budgets', label: 'Orçamentos' },
  { id: 'parts', label: 'Peças e deslocamento' }
];

const REQUEST_STATUSES = ['Aberta', 'Agendada', 'Em Atendimento', 'Concluída', 'Cancelada'];
const BUDGET_STATUSES = ['Rascunho', 'Enviado', 'Aprovado', 'Rejeitado'];

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function percent(value) {
  return `${Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function dateInPeriod(value, period) {
  if (period === 'todos') return true;
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  if (period === 'mes') return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  if (period === 'ano') return date.getFullYear() === now.getFullYear();
  if (period === '90dias') return date >= new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  return true;
}

function budgetDate(budget) {
  return budget.aprovado_em || budget.atualizado_em || budget.criado_em;
}

function sumBudgets(list, initial = {}) {
  return list.reduce((acc, budget) => ({
    ...acc,
    displacement: acc.displacement + Number(budget.deslocamento || 0),
    parts: acc.parts + Number(budget.pecas_total || 0),
    total: acc.total + Number(budget.total || 0),
    count: acc.count + 1
  }), { displacement: 0, parts: 0, total: 0, count: 0, ...initial });
}

function Kpi({ label, value, detail, tone = '' }) {
  return <article className={`report-kpi ${tone ? `report-kpi--${tone}` : ''}`}><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</article>;
}

function ReportTitle({ eyebrow, title, description, badge }) {
  return <div className="reports-header"><div><span className="page-eyebrow">{eyebrow}</span><h3>{title}</h3><p className="section-text">{description}</p></div>{badge && <span className="reports-page__badge">{badge}</span>}</div>;
}

function StatusBars({ rows, valueFormatter = (value) => value }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return <div className="report-status-list">{rows.map((row) => <div className="report-status-row" key={row.label}><div><strong>{row.label}</strong><span>{valueFormatter(row.value)}</span></div><div className="report-status-track"><span style={{ width: `${Math.max((row.value / max) * 100, row.value ? 4 : 0)}%` }} /></div>{row.detail && <small>{row.detail}</small>}</div>)}</div>;
}

export default function Reports() {
  const [data, setData] = useState({ budgets: [], companies: [], units: [], requests: [], users: [], parts: [] });
  const [period, setPeriod] = useState('todos');
  const [section, setSection] = useState('overview');
  const [expandedCompany, setExpandedCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.get('/budgets'), api.get('/companies'), api.get('/units'), api.get('/requests'), api.get('/users'), api.get('/parts')])
      .then(([budgets, companies, units, requests, users, parts]) => setData({ budgets: budgets.data, companies: companies.data, units: units.data, requests: requests.data, users: users.data, parts: parts.data }))
      .catch(() => setError('Não foi possível carregar os relatórios agora.'))
      .finally(() => setLoading(false));
  }, []);

  const filteredBudgets = useMemo(() => data.budgets.filter((budget) => dateInPeriod(budgetDate(budget), period)), [data.budgets, period]);
  const approvedBudgets = useMemo(() => filteredBudgets.filter((budget) => budget.status === 'Aprovado'), [filteredBudgets]);
  const filteredRequests = useMemo(() => data.requests.filter((request) => dateInPeriod(request.criado_em, period)), [data.requests, period]);

  const companyReports = useMemo(() => data.companies.map((company) => {
    const companyBudgets = approvedBudgets.filter((budget) => budget.empresa_id === company.id);
    const branches = data.units.filter((unit) => unit.empresa_id === company.id).map((unit) => sumBudgets(companyBudgets.filter((budget) => budget.unidade_id === unit.id), { id: unit.id, name: unit.nome, type: unit.tipo, company: company.razao_social })).filter((branch) => branch.count > 0).sort((a, b) => b.total - a.total);
    const withoutBranch = companyBudgets.filter((budget) => !budget.unidade_id);
    if (withoutBranch.length) branches.push(sumBudgets(withoutBranch, { id: `sem-filial-${company.id}`, name: 'Sem filial informada', type: 'Outros', company: company.razao_social }));
    return { id: company.id, name: company.razao_social, branches, ...sumBudgets(companyBudgets) };
  }).filter((company) => company.count > 0).sort((a, b) => b.total - a.total), [approvedBudgets, data.companies, data.units]);

  const branchReports = useMemo(() => companyReports.flatMap((company) => company.branches).sort((a, b) => b.total - a.total), [companyReports]);

  const technicianReports = useMemo(() => data.users.filter((user) => user.role === 'tecnico').map((technician) => {
    const requests = filteredRequests.filter((request) => request.assigned_technician === technician.id);
    const requestIds = new Set(requests.map((request) => request.id));
    const budgets = approvedBudgets.filter((budget) => requestIds.has(budget.request_id));
    const ratings = requests.map((request) => Number(request.avaliacao || 0)).filter(Boolean);
    return { id: technician.id, name: technician.nome, assigned: requests.length, completed: requests.filter((request) => request.status === 'Concluída').length, inProgress: requests.filter((request) => request.status === 'Em Atendimento').length, rating: ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : 0, ...sumBudgets(budgets) };
  }).filter((row) => row.assigned > 0 || row.total > 0).sort((a, b) => b.completed - a.completed || b.total - a.total), [approvedBudgets, data.users, filteredRequests]);

  const partReports = useMemo(() => {
    const byId = new Map();
    approvedBudgets.forEach((budget) => (budget.items || []).forEach((item) => {
      const id = item.peca_id || 'sem-cadastro';
      const current = byId.get(id) || { id, quantity: 0, total: 0, budgets: new Set() };
      current.quantity += Number(item.quantidade || 0);
      current.total += Number(item.quantidade || 0) * Number(item.valor_unitario || 0);
      current.budgets.add(budget.id);
      byId.set(id, current);
    }));
    return [...byId.values()].map((row) => {
      const part = data.parts.find((item) => item.id === row.id);
      return { ...row, name: part?.nome || 'Peça sem cadastro', code: part?.codigo || '—', stock: Number(part?.estoque || 0), budgetCount: row.budgets.size };
    }).sort((a, b) => b.total - a.total);
  }, [approvedBudgets, data.parts]);

  const totals = sumBudgets(approvedBudgets);
  const ticket = totals.count ? totals.total / totals.count : 0;
  const approvalRate = filteredBudgets.length ? (approvedBudgets.length / filteredBudgets.length) * 100 : 0;
  const completedRequests = filteredRequests.filter((request) => request.status === 'Concluída').length;
  const averageRatingValues = filteredRequests.map((request) => Number(request.avaliacao || 0)).filter(Boolean);
  const averageRating = averageRatingValues.length ? averageRatingValues.reduce((sum, value) => sum + value, 0) / averageRatingValues.length : 0;
  const requestStatusRows = REQUEST_STATUSES.map((status) => ({ label: status, value: filteredRequests.filter((request) => request.status === status).length }));
  const budgetStatusRows = BUDGET_STATUSES.map((status) => { const list = filteredBudgets.filter((budget) => budget.status === status); return { label: status, value: list.length, detail: money(list.reduce((sum, budget) => sum + Number(budget.total || 0), 0)) }; });
  const urgencyRows = ['Baixa', 'Normal', 'Alta', 'Urgente'].map((urgency) => ({ label: urgency, value: filteredRequests.filter((request) => request.urgencia === urgency).length }));

  const monthTrend = useMemo(() => {
    const rows = [];
    const now = new Date();
    for (let index = 5; index >= 0; index--) {
      const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
      const value = data.budgets.filter((budget) => { const itemDate = new Date(budgetDate(budget)); return budget.status === 'Aprovado' && itemDate.getFullYear() === date.getFullYear() && itemDate.getMonth() === date.getMonth(); }).reduce((sum, budget) => sum + Number(budget.total || 0), 0);
      rows.push({ label: date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }), value });
    }
    return rows;
  }, [data.budgets]);

  const changePeriod = (value) => { setPeriod(value); setExpandedCompany(null); };

  return (
    <section className="dashboard-page reports-page">
      <div className="page-header reports-page__header">
        <div><span className="page-eyebrow">CENTRAL DE RELATÓRIOS</span><h2 className="page-title">Indicadores completos da operação</h2><p className="section-text">Acompanhe resultados financeiros, empresas, filiais, técnicos, chamados, orçamentos e peças em um único lugar.</p></div>
        <div className="reports-page__actions"><label className="report-filter"><span>Período</span><select className="form-input" value={period} onChange={(event) => changePeriod(event.target.value)}>{PERIODS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><button type="button" className="btn btn-outline" onClick={() => window.print()}>Imprimir</button></div>
      </div>

      <nav className="report-tabs" aria-label="Categorias de relatórios">{SECTIONS.map((item) => <button type="button" key={item.id} className={section === item.id ? 'is-active' : ''} onClick={() => setSection(item.id)}>{item.label}</button>)}</nav>
      {loading && <p className="section-text">Carregando relatórios…</p>}
      {error && <div className="alert error">{error}</div>}

      {!loading && !error && section === 'overview' && <div className="report-content-grid">
        <section className="reports-section report-content-grid__wide"><ReportTitle eyebrow="RESUMO EXECUTIVO" title="Visão geral da operação" description="Principais indicadores do período selecionado." /><div className="report-kpi-grid"><Kpi label="Lucro bruto aprovado" value={money(totals.total)} detail={`${totals.count} orçamentos aprovados`} tone="green" /><Kpi label="Deslocamento" value={money(totals.displacement)} detail={percent(totals.total ? (totals.displacement / totals.total) * 100 : 0)} /><Kpi label="Peças" value={money(totals.parts)} detail={percent(totals.total ? (totals.parts / totals.total) * 100 : 0)} /><Kpi label="Ticket médio" value={money(ticket)} detail="por orçamento aprovado" /><Kpi label="Taxa de aprovação" value={percent(approvalRate)} detail={`${filteredBudgets.length} orçamentos no período`} tone="blue" /><Kpi label="Chamados concluídos" value={completedRequests} detail={`${filteredRequests.length} chamados no período`} /><Kpi label="Avaliação média" value={averageRating ? `${averageRating.toFixed(1)} / 5` : 'Sem avaliações'} detail={`${averageRatingValues.length} avaliações`} /><Kpi label="Empresas com receita" value={companyReports.length} detail={`${branchReports.length} filiais com movimento`} /></div></section>
        <section className="reports-section"><ReportTitle eyebrow="EVOLUÇÃO" title="Últimos 6 meses" description="Lucro bruto aprovado por mês." /><StatusBars rows={monthTrend} valueFormatter={money} /></section>
        <section className="reports-section"><ReportTitle eyebrow="DESTAQUES" title="Líderes do período" description="Melhores resultados em cada categoria." /><div className="report-highlight-list"><div><span>Empresa</span><strong>{companyReports[0]?.name || 'Sem dados'}</strong><small>{money(companyReports[0]?.total)}</small></div><div><span>Filial</span><strong>{branchReports[0]?.name || 'Sem dados'}</strong><small>{money(branchReports[0]?.total)}</small></div><div><span>Técnico</span><strong>{technicianReports[0]?.name || 'Sem dados'}</strong><small>{technicianReports[0]?.completed || 0} concluídos</small></div><div><span>Peça</span><strong>{partReports[0]?.name || 'Sem dados'}</strong><small>{partReports[0]?.quantity || 0} unidades</small></div></div></section>
      </div>}

      {!loading && !error && section === 'companies' && <section className="reports-section"><ReportTitle eyebrow="EMPRESAS" title="Top 10 empresas com maior lucro bruto" description="Clique em uma empresa para consultar o resultado de cada filial." badge={`TOP ${Math.min(companyReports.length, 10) || 10}`} /><div className="report-summary"><div><span>Deslocamento</span><strong>{money(totals.displacement)}</strong></div><div><span>Peças</span><strong>{money(totals.parts)}</strong></div><div className="report-summary__total"><span>Lucro bruto</span><strong>{money(totals.total)}</strong></div></div>{companyReports.length === 0 ? <p className="section-text reports-empty">Nenhum orçamento aprovado no período.</p> : <div className="company-report-list">{companyReports.slice(0, 10).map((company, index) => { const expanded = expandedCompany === company.id; return <article className={`company-report ${expanded ? 'is-expanded' : ''}`} key={company.id}><button type="button" className="company-report__button" onClick={() => setExpandedCompany(expanded ? null : company.id)} aria-expanded={expanded}><span className="company-report__rank">{index + 1}</span><span className="company-report__identity"><strong>{company.name}</strong><small>{company.count} orçamentos aprovados</small></span><span className="company-report__value"><small>Deslocamento</small>{money(company.displacement)}</span><span className="company-report__value"><small>Peças</small>{money(company.parts)}</span><span className="company-report__value company-report__value--total"><small>Lucro bruto</small>{money(company.total)}</span><span className="company-report__chevron" aria-hidden="true">⌄</span></button>{expanded && <div className="branch-report"><div className="branch-report__heading"><span>Filial</span><span>Deslocamento</span><span>Peças</span><span>Lucro bruto</span></div>{company.branches.length === 0 ? <p className="section-text">Nenhuma filial com orçamento aprovado.</p> : company.branches.map((branch) => <div className="branch-report__row" key={branch.id}><span><strong>{branch.name}</strong><small>{branch.type} · {branch.count} orçamentos</small></span><span>{money(branch.displacement)}</span><span>{money(branch.parts)}</span><strong>{money(branch.total)}</strong></div>)}</div>}</article>; })}</div>}</section>}

      {!loading && !error && section === 'branches' && <section className="reports-section"><ReportTitle eyebrow="FILIAIS" title="Top 10 filiais com maior resultado" description="Comparativo direto entre sedes e filiais com orçamento aprovado." badge={`TOP ${Math.min(branchReports.length, 10) || 10}`} /><div className="report-table-wrap"><table className="report-table"><thead><tr><th>#</th><th>Filial</th><th>Empresa</th><th>Orçamentos</th><th>Deslocamento</th><th>Peças</th><th>Lucro bruto</th></tr></thead><tbody>{branchReports.slice(0, 10).map((branch, index) => <tr key={branch.id}><td><span className="company-report__rank">{index + 1}</span></td><td><strong>{branch.name}</strong><small>{branch.type}</small></td><td>{branch.company}</td><td>{branch.count}</td><td>{money(branch.displacement)}</td><td>{money(branch.parts)}</td><td className="report-table__money">{money(branch.total)}</td></tr>)}</tbody></table></div></section>}

      {!loading && !error && section === 'technicians' && <section className="reports-section"><ReportTitle eyebrow="TÉCNICOS" title="Produtividade da equipe técnica" description="Atendimentos, conclusões, avaliações e valores aprovados por técnico." /><div className="report-table-wrap"><table className="report-table"><thead><tr><th>Técnico</th><th>Atribuídos</th><th>Concluídos</th><th>Em atendimento</th><th>Avaliação</th><th>Valor aprovado</th></tr></thead><tbody>{technicianReports.map((technician) => <tr key={technician.id}><td><strong>{technician.name}</strong></td><td>{technician.assigned}</td><td>{technician.completed}</td><td>{technician.inProgress}</td><td>{technician.rating ? `${technician.rating.toFixed(1)} / 5` : '—'}</td><td className="report-table__money">{money(technician.total)}</td></tr>)}</tbody></table></div></section>}

      {!loading && !error && section === 'requests' && <div className="report-content-grid"><section className="reports-section"><ReportTitle eyebrow="CHAMADOS" title="Chamados por status" description={`${filteredRequests.length} chamados abertos no período selecionado.`} /><StatusBars rows={requestStatusRows} /></section><section className="reports-section"><ReportTitle eyebrow="PRIORIDADE" title="Chamados por urgência" description="Distribuição do volume conforme a prioridade informada." /><StatusBars rows={urgencyRows} /></section></div>}

      {!loading && !error && section === 'budgets' && <div className="report-content-grid"><section className="reports-section"><ReportTitle eyebrow="ORÇAMENTOS" title="Orçamentos por status" description="Quantidade e valor total em cada etapa comercial." /><StatusBars rows={budgetStatusRows} /></section><section className="reports-section"><ReportTitle eyebrow="CONVERSÃO" title="Resultado comercial" description="Indicadores de aprovação no período." /><div className="report-kpi-grid report-kpi-grid--compact"><Kpi label="Taxa de aprovação" value={percent(approvalRate)} tone="green" /><Kpi label="Aprovados" value={approvedBudgets.length} detail={money(totals.total)} /><Kpi label="Pendentes" value={filteredBudgets.filter((budget) => budget.status === 'Enviado').length} /><Kpi label="Rejeitados" value={filteredBudgets.filter((budget) => budget.status === 'Rejeitado').length} /></div></section></div>}

      {!loading && !error && section === 'parts' && <div className="report-content-grid"><section className="reports-section report-content-grid__wide"><ReportTitle eyebrow="PEÇAS" title="Peças mais utilizadas e vendidas" description="Ranking por valor aprovado, com quantidade e posição atual de estoque." badge={`TOP ${Math.min(partReports.length, 10) || 10}`} /><div className="report-table-wrap"><table className="report-table"><thead><tr><th>#</th><th>Peça</th><th>Quantidade</th><th>Orçamentos</th><th>Estoque atual</th><th>Valor aprovado</th></tr></thead><tbody>{partReports.slice(0, 10).map((part, index) => <tr key={part.id}><td>{index + 1}</td><td><strong>{part.name}</strong><small>{part.code}</small></td><td>{part.quantity}</td><td>{part.budgetCount}</td><td>{part.stock}</td><td className="report-table__money">{money(part.total)}</td></tr>)}</tbody></table></div></section><section className="reports-section"><ReportTitle eyebrow="COMPOSIÇÃO" title="Peças x deslocamento" description="Participação de cada componente no lucro bruto aprovado." /><div className="report-kpi-grid report-kpi-grid--compact"><Kpi label="Peças" value={money(totals.parts)} detail={percent(totals.total ? (totals.parts / totals.total) * 100 : 0)} /><Kpi label="Deslocamento" value={money(totals.displacement)} detail={percent(totals.total ? (totals.displacement / totals.total) * 100 : 0)} /></div></section></div>}
    </section>
  );
}
