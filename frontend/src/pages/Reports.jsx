import { useEffect, useMemo, useState } from 'react';
import api from '../api';

const PERIODS = [
  { value: 'todos', label: 'Todo o período' },
  { value: 'mes', label: 'Este mês' },
  { value: '90dias', label: 'Últimos 90 dias' },
  { value: 'ano', label: 'Este ano' }
];

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function inPeriod(budget, period) {
  if (period === 'todos') return true;
  const value = budget.aprovado_em || budget.atualizado_em || budget.criado_em;
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  if (period === 'mes') return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  if (period === 'ano') return date.getFullYear() === now.getFullYear();
  if (period === '90dias') return date >= new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  return true;
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

export default function Reports() {
  const [budgets, setBudgets] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [units, setUnits] = useState([]);
  const [period, setPeriod] = useState('todos');
  const [expandedCompany, setExpandedCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.get('/budgets'), api.get('/companies'), api.get('/units')])
      .then(([budgetsRes, companiesRes, unitsRes]) => {
        setBudgets(budgetsRes.data);
        setCompanies(companiesRes.data);
        setUnits(unitsRes.data);
      })
      .catch(() => setError('Não foi possível carregar os relatórios agora.'))
      .finally(() => setLoading(false));
  }, []);

  const approvedBudgets = useMemo(() => budgets.filter(
    (budget) => budget.status === 'Aprovado' && inPeriod(budget, period)
  ), [budgets, period]);

  const topCompanies = useMemo(() => companies.map((company) => {
    const companyBudgets = approvedBudgets.filter((budget) => budget.empresa_id === company.id);
    const branches = units
      .filter((unit) => unit.empresa_id === company.id)
      .map((unit) => sumBudgets(
        companyBudgets.filter((budget) => budget.unidade_id === unit.id),
        { id: unit.id, name: unit.nome, type: unit.tipo }
      ))
      .filter((branch) => branch.count > 0)
      .sort((a, b) => b.total - a.total);

    const withoutBranch = companyBudgets.filter((budget) => !budget.unidade_id);
    if (withoutBranch.length) {
      branches.push(sumBudgets(withoutBranch, { id: 'sem-filial', name: 'Sem filial informada', type: 'Outros' }));
    }

    return { id: company.id, name: company.razao_social, branches, ...sumBudgets(companyBudgets) };
  })
    .filter((company) => company.count > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10), [approvedBudgets, companies, units]);

  const totals = topCompanies.reduce((acc, company) => ({
    displacement: acc.displacement + company.displacement,
    parts: acc.parts + company.parts,
    total: acc.total + company.total
  }), { displacement: 0, parts: 0, total: 0 });

  return (
    <section className="dashboard-page reports-page">
      <div className="page-header reports-page__header">
        <div>
          <span className="page-eyebrow">RELATÓRIOS</span>
          <h2 className="page-title">Top 10 empresas com maior lucro bruto</h2>
          <p className="section-text">Valores de orçamentos aprovados antes do desconto de custos internos, separados entre deslocamento e peças.</p>
        </div>
        <label className="report-filter">
          <span>Período</span>
          <select className="form-input" value={period} onChange={(event) => {
            setPeriod(event.target.value);
            setExpandedCompany(null);
          }}>
            {PERIODS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
      </div>

      {loading && <p className="section-text">Carregando relatórios…</p>}
      {error && <div className="alert error">{error}</div>}

      {!loading && !error && (
        <section className="reports-section" aria-labelledby="ranking-title">
          <div className="reports-header">
            <div>
              <span className="page-eyebrow">RANKING</span>
              <h3 id="ranking-title">Empresas com maior resultado</h3>
              <p className="section-text">Clique em uma empresa para consultar o resultado de cada filial.</p>
            </div>
            <span className="reports-page__badge">TOP {topCompanies.length || 10}</span>
          </div>

          <div className="report-summary">
            <div><span>Deslocamento</span><strong>{money(totals.displacement)}</strong></div>
            <div><span>Peças</span><strong>{money(totals.parts)}</strong></div>
            <div className="report-summary__total"><span>Lucro bruto</span><strong>{money(totals.total)}</strong></div>
          </div>

          {topCompanies.length === 0 ? (
            <p className="section-text reports-empty">Nenhum orçamento aprovado no período selecionado.</p>
          ) : (
            <div className="company-report-list">
              {topCompanies.map((company, index) => {
                const expanded = expandedCompany === company.id;
                return (
                  <article className={`company-report ${expanded ? 'is-expanded' : ''}`} key={company.id}>
                    <button type="button" className="company-report__button" onClick={() => setExpandedCompany(expanded ? null : company.id)} aria-expanded={expanded}>
                      <span className="company-report__rank">{index + 1}</span>
                      <span className="company-report__identity">
                        <strong>{company.name}</strong>
                        <small>{company.count} orçamento{company.count === 1 ? '' : 's'} aprovado{company.count === 1 ? '' : 's'}</small>
                      </span>
                      <span className="company-report__value"><small>Deslocamento</small>{money(company.displacement)}</span>
                      <span className="company-report__value"><small>Peças</small>{money(company.parts)}</span>
                      <span className="company-report__value company-report__value--total"><small>Lucro bruto</small>{money(company.total)}</span>
                      <span className="company-report__chevron" aria-hidden="true">⌄</span>
                    </button>

                    {expanded && (
                      <div className="branch-report">
                        <div className="branch-report__heading">
                          <span>Filial</span><span>Deslocamento</span><span>Peças</span><span>Lucro bruto</span>
                        </div>
                        {company.branches.length === 0 ? (
                          <p className="section-text">Nenhuma filial possui orçamento aprovado neste período.</p>
                        ) : company.branches.map((branch) => (
                          <div className="branch-report__row" key={branch.id}>
                            <span><strong>{branch.name}</strong><small>{branch.type} · {branch.count} orçamento{branch.count === 1 ? '' : 's'}</small></span>
                            <span>{money(branch.displacement)}</span>
                            <span>{money(branch.parts)}</span>
                            <strong>{money(branch.total)}</strong>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </section>
  );
}
