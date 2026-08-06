import { Fragment, useEffect, useState } from 'react';
import api from '../api';
import { getUser } from '../utils/auth';

const emptyForm = { request_id: '', regra_cobranca_id: '', deslocamento: '', urgencia: '', horas_trabalho: '' };

const STATUS_BADGE = {
  'Rascunho': 'badge-rascunho',
  'Enviado': 'badge-enviado',
  'Aprovado': 'badge-aprovado',
  'Rejeitado': 'badge-rejeitado'
};

function money(value) {
  return `R$ ${Number(value || 0).toFixed(2)}`;
}

export default function Budgets() {
  const user = getUser();
  const [budgets, setBudgets] = useState([]);
  const [requests, setRequests] = useState([]);
  const [rules, setRules] = useState([]);
  const [parts, setParts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState([]);
  const [itemDraft, setItemDraft] = useState({ peca_id: '', quantidade: 1 });
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState({});

  const canCreate = ['tecnico', 'analista', 'gestor'].includes(user?.role);
  const isStaff = ['tecnico', 'analista', 'gestor'].includes(user?.role);

  const load = () => {
    api.get('/budgets').then((res) => setBudgets(res.data));
    api.get('/requests').then((res) => setRequests(res.data)).catch(() => {});
    api.get('/rules').then((res) => setRules(res.data)).catch(() => {});
    api.get('/parts').then((res) => setParts(res.data)).catch(() => {});
    api.get('/companies').then((res) => setCompanies(res.data)).catch(() => {});
    api.get('/contracts').then((res) => setContracts(res.data)).catch(() => {});
  };

  useEffect(() => {
    load();
  }, []);

  const requestFor = (id) => requests.find((r) => r.id === id);
  const requestLabel = (id) => {
    const req = requestFor(id);
    return req ? `${req.descricao} (${req.status})` : id;
  };
  const companyForRequest = (id) => {
    const req = requestFor(id);
    return req ? companies.find((c) => c.id === req.empresa_id) : null;
  };
  const ruleName = (id) => rules.find((r) => r.id === id)?.tipo || '—';
  const partName = (id) => parts.find((p) => p.id === id)?.nome || id;

  const addItem = () => {
    const part = parts.find((p) => p.id === itemDraft.peca_id);
    if (!part || !itemDraft.quantidade || itemDraft.quantidade <= 0) return;
    setItems([...items, { peca_id: part.id, valor_unitario: part.preco_unitario, quantidade: Number(itemDraft.quantidade) }]);
    setItemDraft({ peca_id: '', quantidade: 1 });
  };

  const removeItem = (idx) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/budgets', {
        request_id: form.request_id,
        regra_cobranca_id: form.regra_cobranca_id,
        items,
        deslocamento: Number(form.deslocamento) || 0,
        urgencia: Number(form.urgencia) || 0,
        horas_trabalho: Number(form.horas_trabalho) || 0
      });
      setForm(emptyForm);
      setItems([]);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao criar orçamento');
    }
  };

  const changeStatus = async (budget, status) => {
    setError('');
    try {
      await api.patch(`/budgets/${budget.id}/status`, { status });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao atualizar orçamento');
    }
  };

  const isOwnCompanyBudget = (budget) => {
    const req = requests.find((r) => r.id === budget.request_id);
    return req && req.empresa_id === user?.empresa_id;
  };

  const toggleExpanded = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const contractFor = (budgetId) => contracts.find((c) => c.orcamento_id === budgetId);

  const openContractPdf = (contractId) => {
    api.get(`/contracts/${contractId}/pdf`, { responseType: 'blob' }).then((res) => {
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
    });
  };

  return (
    <div>
      <h2 className="page-title">Orçamentos</h2>
      {error && <div className="alert alert-error">{error}</div>}

      {canCreate && (
        <form onSubmit={handleSubmit} className="card-form">
          <h3>Novo orçamento</h3>
          <label className="form-field">
            Solicitação
            <select className="form-select" value={form.request_id} onChange={(e) => setForm({ ...form, request_id: e.target.value })} required>
              <option value="">Selecione</option>
              {requests.map((req) => (<option key={req.id} value={req.id}>{req.descricao} — {req.status}</option>))}
            </select>
          </label>
          <label className="form-field">
            Regra de cobrança
            <select className="form-select" value={form.regra_cobranca_id} onChange={(e) => setForm({ ...form, regra_cobranca_id: e.target.value })} required>
              <option value="">Selecione</option>
              {rules.map((rule) => (<option key={rule.id} value={rule.id}>{rule.tipo} — R$ {Number(rule.valor_base).toFixed(2)}</option>))}
            </select>
          </label>

          <div className="item-row">
            <label className="form-field">
              Peça
              <select className="form-select" value={itemDraft.peca_id} onChange={(e) => setItemDraft({ ...itemDraft, peca_id: e.target.value })}>
                <option value="">Selecione</option>
                {parts.map((part) => (<option key={part.id} value={part.id}>{part.nome} — R$ {part.preco_unitario.toFixed(2)}</option>))}
              </select>
            </label>
            <label className="form-field">
              Qtd
              <input className="form-input" type="number" min="1" value={itemDraft.quantidade} onChange={(e) => setItemDraft({ ...itemDraft, quantidade: e.target.value })} />
            </label>
            <button type="button" className="btn btn-outline" onClick={addItem}>Adicionar peça</button>
          </div>

          {items.length > 0 && (
            <ul className="item-list">
              {items.map((item, idx) => (
                <li key={idx}>
                  <span>{partName(item.peca_id)} × {item.quantidade} — R$ {(item.valor_unitario * item.quantidade).toFixed(2)}</span>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => removeItem(idx)}>Remover</button>
                </li>
              ))}
            </ul>
          )}

          <label className="form-field">Horas de trabalho<input className="form-input" type="number" step="0.5" value={form.horas_trabalho} onChange={(e) => setForm({ ...form, horas_trabalho: e.target.value })} /></label>
          <label className="form-field">Deslocamento (R$)<input className="form-input" type="number" step="0.01" value={form.deslocamento} onChange={(e) => setForm({ ...form, deslocamento: e.target.value })} /></label>
          <label className="form-field">Urgência (R$)<input className="form-input" type="number" step="0.01" value={form.urgencia} onChange={(e) => setForm({ ...form, urgencia: e.target.value })} /></label>

          <button type="submit" className="btn btn-primary">Criar orçamento</button>
        </form>
      )}

      <table className="data-table">
        <thead>
          <tr>
            <th>Solicitação</th>
            <th>Status</th>
            <th>Itens</th>
            <th>Total</th>
            <th></th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {budgets.map((budget) => {
            const isOpen = !!expanded[budget.id];
            const comp = companyForRequest(budget.request_id);
            return (
              <Fragment key={budget.id}>
                <tr>
                  <td>{requestLabel(budget.request_id)}</td>
                  <td><span className={`badge ${STATUS_BADGE[budget.status] || ''}`}>{budget.status}</span></td>
                  <td>{budget.items?.length || 0} item(ns)</td>
                  <td>{money(budget.total)}</td>
                  <td>
                    <button className="btn btn-outline btn-sm" onClick={() => toggleExpanded(budget.id)}>
                      {isOpen ? 'Ocultar' : 'Detalhes'}
                    </button>
                  </td>
                  <td>
                    <div className="row-actions">
                      {isStaff && budget.status === 'Rascunho' && (
                        <button className="btn btn-primary btn-sm" onClick={() => changeStatus(budget, 'Enviado')}>Enviar</button>
                      )}
                      {isStaff && budget.status === 'Enviado' && (
                        <>
                          <button className="btn btn-primary btn-sm" onClick={() => changeStatus(budget, 'Aprovado')}>Aprovar</button>
                          <button className="btn btn-danger btn-sm" onClick={() => changeStatus(budget, 'Rejeitado')}>Rejeitar</button>
                        </>
                      )}
                      {user?.role === 'cliente' && budget.status === 'Enviado' && isOwnCompanyBudget(budget) && (
                        <>
                          <button className="btn btn-primary btn-sm" onClick={() => changeStatus(budget, 'Aprovado')}>Aprovar</button>
                          <button className="btn btn-danger btn-sm" onClick={() => changeStatus(budget, 'Rejeitado')}>Rejeitar</button>
                        </>
                      )}
                      {budget.status === 'Aprovado' && contractFor(budget.id) && (
                        <button className="btn btn-outline btn-sm" onClick={() => openContractPdf(contractFor(budget.id).id)}>
                          Baixar contrato
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={6}>
                      <div className="detail-panel">
                        <div className="detail-grid">
                          <div>
                            <strong>Empresa</strong>
                            <p>{comp?.razao_social || '—'}</p>
                          </div>
                          <div>
                            <strong>Regra de cobrança</strong>
                            <p>{ruleName(budget.regra_cobranca_id)} — {money(budget.base_total)}</p>
                          </div>
                          <div>
                            <strong>Mão de obra</strong>
                            <p>{budget.horas_trabalho}h × R$ 100,00 = {money(budget.mao_obra_total)}</p>
                          </div>
                          <div>
                            <strong>Deslocamento</strong>
                            <p>{money(budget.deslocamento)}</p>
                          </div>
                          <div>
                            <strong>Urgência</strong>
                            <p>{money(budget.urgencia)}</p>
                          </div>
                        </div>

                        {budget.items?.length > 0 && (
                          <ul className="item-list" style={{ marginTop: 16 }}>
                            {budget.items.map((item) => (
                              <li key={item.id}>
                                <span>{partName(item.peca_id)} × {item.quantidade}</span>
                                <span>{money(item.valor_unitario * item.quantidade)}</span>
                              </li>
                            ))}
                          </ul>
                        )}

                        <div className="detail-report">
                          <strong>Total</strong>
                          <p>{money(budget.total)} ({money(budget.base_total)} base + {money(budget.pecas_total)} peças + {money(budget.mao_obra_total)} mão de obra + {money(budget.deslocamento)} deslocamento + {money(budget.urgencia)} urgência)</p>
                        </div>
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
