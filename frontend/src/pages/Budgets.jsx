import { Fragment, useEffect, useState } from 'react';
import api from '../api';
import { getUser } from '../utils/auth';
import SearchableSelect from '../components/SearchableSelect';

const emptyForm = { request_id: '', empresa_id: '', unidade_id: '', deslocamento: '', motivo_troca: '', observacoes_tecnicas: '' };

const STATUS_BADGE = {
  'Rascunho': 'badge-rascunho',
  'Enviado': 'badge-enviado',
  'Aprovado': 'badge-aprovado',
  'Rejeitado': 'badge-rejeitado'
};

function money(value) {
  return `R$ ${Number(value || 0).toFixed(2)}`;
}

function norm(str) {
  return (str || '').toLowerCase().trim();
}

// Procura, na descrição do chamado, o nome de peças já cadastradas no
// catálogo (ex.: descrição "Troca do teclado e braço da catraca" bate com
// as peças "Teclado" e "Braço da catraca", se existirem no catálogo).
function matchPartsFromText(text, parts) {
  const texto = norm(text);
  if (!texto) return [];
  return parts.filter((part) => part.nome && texto.includes(norm(part.nome)));
}

export default function Budgets() {
  const user = getUser();
  const [budgets, setBudgets] = useState([]);
  const [requests, setRequests] = useState([]);
  const [parts, setParts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [units, setUnits] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState([]);
  const [itemDraft, setItemDraft] = useState({ peca_id: '', quantidade: 1 });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [expanded, setExpanded] = useState({});
  const [itemsAutoFilled, setItemsAutoFilled] = useState(false);

  const canCreate = ['tecnico', 'analista', 'gestor'].includes(user?.role);
  const isStaff = ['tecnico', 'analista', 'gestor'].includes(user?.role);

  const load = () => {
    api.get('/budgets').then((res) => setBudgets(res.data));
    api.get('/requests').then((res) => setRequests(res.data)).catch(() => {});
    api.get('/parts').then((res) => setParts(res.data)).catch(() => {});
    api.get('/companies').then((res) => setCompanies(res.data)).catch(() => {});
    api.get('/units').then((res) => setUnits(res.data)).catch(() => {});
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
  const companyFor = (budget) => companies.find((c) => c.id === (budget.empresa_id || requestFor(budget.request_id)?.empresa_id)) || null;
  const unitFor = (budget) => units.find((u) => u.id === budget.unidade_id) || null;
  const partName = (id) => parts.find((p) => p.id === id)?.nome || id;

  const unitsForSelectedCompany = units.filter((u) => u.empresa_id === form.empresa_id);
  const requestsForSelectedCompany = requests.filter((r) => r.empresa_id === form.empresa_id);

  const addItem = () => {
    const part = parts.find((p) => p.id === itemDraft.peca_id);
    if (!part || !itemDraft.quantidade || itemDraft.quantidade <= 0) return;
    setItems([...items, { peca_id: part.id, valor_unitario: part.preco_unitario, quantidade: Number(itemDraft.quantidade) }]);
    setItemDraft({ peca_id: '', quantidade: 1 });
    setItemsAutoFilled(false);
  };

  const removeItem = (idx) => {
    setItems(items.filter((_, i) => i !== idx));
    setItemsAutoFilled(false);
  };

  const selectRequest = (id) => {
    const req = requests.find((r) => r.id === id);
    setForm({ ...form, request_id: id });
    if (req && items.length === 0) {
      const matched = matchPartsFromText(req.descricao, parts);
      if (matched.length > 0) {
        setItems(matched.map((part) => ({ peca_id: part.id, valor_unitario: part.preco_unitario, quantidade: 1 })));
        setItemsAutoFilled(true);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!form.empresa_id) {
      setError('Selecione uma empresa.');
      return;
    }
    if (!form.request_id) {
      setError('Selecione uma solicitação.');
      return;
    }
    if (items.length === 0) {
      setError('Adicione ao menos uma peça que será trocada.');
      return;
    }
    if (!form.motivo_troca.trim()) {
      setError('Informe o motivo da troca.');
      return;
    }
    if (form.deslocamento === '' || Number(form.deslocamento) < 0) {
      setError('Informe o valor da visita técnica.');
      return;
    }
    try {
      await api.post('/budgets', {
        request_id: form.request_id,
        empresa_id: form.empresa_id,
        unidade_id: form.unidade_id || null,
        items,
        deslocamento: Number(form.deslocamento) || 0,
        motivo_troca: form.motivo_troca.trim(),
        observacoes_tecnicas: form.observacoes_tecnicas.trim()
      });
      setForm(emptyForm);
      setItems([]);
      setItemDraft({ peca_id: '', quantidade: 1 });
      setItemsAutoFilled(false);
      setSuccess('Orçamento criado com sucesso!');
      load();
      setTimeout(() => setSuccess(''), 4000);
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

  const handleDeleteBudget = async (budget) => {
    if (!window.confirm('Excluir este orçamento? Esta ação não pode ser desfeita.')) return;
    setError('');
    try {
      await api.delete(`/budgets/${budget.id}`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao excluir orçamento');
    }
  };

  return (
    <div>
      <h2 className="page-title">Orçamentos</h2>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {canCreate && (
        <form onSubmit={handleSubmit} className="card-form">
          <h3>Novo orçamento</h3>

          <label className="form-field">
            Empresa
            <SearchableSelect
              value={form.empresa_id}
              onChange={(id) => setForm({ ...form, empresa_id: id, unidade_id: '', request_id: '' })}
              placeholder="Pesquise uma empresa..."
              options={companies.map((c) => ({ value: c.id, label: c.razao_social, sublabel: c.cnpj }))}
            />
          </label>

          {form.empresa_id && unitsForSelectedCompany.length > 0 && (
            <label className="form-field">
              Filial / Sede (opcional)
              <SearchableSelect
                value={form.unidade_id}
                onChange={(id) => {
                  const unit = unitsForSelectedCompany.find((u) => u.id === id);
                  const TAXA_MOTORISTA = 100;
                  const base = unit?.valor_deslocamento_padrao != null ? Number(unit.valor_deslocamento_padrao) : 0;
                  setForm({
                    ...form,
                    unidade_id: id,
                    deslocamento: String(base + TAXA_MOTORISTA)
                  });
                }}
                placeholder="Digite para buscar a filial ou sede..."
                options={unitsForSelectedCompany.map((u) => ({
                  value: u.id,
                  label: `${u.tipo} — ${u.nome}`,
                  sublabel: [u.endereco, u.cidade && u.estado ? `${u.cidade}/${u.estado}` : u.cidade].filter(Boolean).join(', ')
                }))}
              />
            </label>
          )}

          <label className="form-field">
            Solicitação
            <SearchableSelect
              value={form.request_id}
              onChange={selectRequest}
              placeholder={form.empresa_id ? 'Digite para buscar a solicitação...' : 'Selecione uma empresa primeiro'}
              disabled={!form.empresa_id}
              emptyMessage="Nenhuma solicitação para esta empresa."
              options={requestsForSelectedCompany.map((req) => ({ value: req.id, label: req.descricao, sublabel: req.status }))}
            />
          </label>

          {itemsAutoFilled && (
            <p className="section-text" style={{ color: 'var(--verde, #1e8e5a)' }}>
              Peça(s) identificada(s) automaticamente pela descrição do chamado, com o valor do catálogo — confira antes de enviar.
            </p>
          )}

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

          <label className="form-field">Valor da visita técnica (R$)<input className="form-input" type="number" step="0.01" value={form.deslocamento} onChange={(e) => setForm({ ...form, deslocamento: e.target.value })} /></label>

          <label className="form-field">
            Motivo da troca
            <textarea className="form-textarea" value={form.motivo_troca} onChange={(e) => setForm({ ...form, motivo_troca: e.target.value })} />
          </label>
          <label className="form-field">
            Observações técnicas (informações relevantes encontradas no atendimento)
            <textarea className="form-textarea" value={form.observacoes_tecnicas} onChange={(e) => setForm({ ...form, observacoes_tecnicas: e.target.value })} />
          </label>

          {items.length > 0 && (
            <p className="section-text">
              Valor da peça: {money(items.reduce((sum, item) => sum + item.valor_unitario * item.quantidade, 0))} + Visita técnica: {money(Number(form.deslocamento) || 0)} = Total: {money(items.reduce((sum, item) => sum + item.valor_unitario * item.quantidade, 0) + (Number(form.deslocamento) || 0))}
            </p>
          )}

          <button type="submit" className="btn btn-primary">Criar orçamento</button>
        </form>
      )}

      <table className="data-table">
        <thead>
          <tr>
            <th>Solicitação</th>
            <th>Empresa</th>
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
            const comp = companyFor(budget);
            const unit = unitFor(budget);
            return (
              <Fragment key={budget.id}>
                <tr>
                  <td>{requestLabel(budget.request_id)}</td>
                  <td>{comp?.razao_social || '—'}</td>
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
                        <span className="badge badge-enviado">Aguardando autorização do cliente</span>
                      )}
                      {user?.role === 'cliente' && budget.status === 'Enviado' && isOwnCompanyBudget(budget) && (
                        <>
                          <button className="btn btn-primary btn-sm" onClick={() => changeStatus(budget, 'Aprovado')}>Autorizar</button>
                          <button className="btn btn-danger btn-sm" onClick={() => changeStatus(budget, 'Rejeitado')}>Não autorizar</button>
                        </>
                      )}
                      {budget.status === 'Aprovado' && contractFor(budget.id) && (
                        <button className="btn btn-outline btn-sm" onClick={() => openContractPdf(contractFor(budget.id).id)}>
                          Baixar contrato
                        </button>
                      )}
                      {user?.role === 'gestor' && (
                        <button className="btn btn-danger btn-sm" onClick={() => handleDeleteBudget(budget)}>Excluir</button>
                      )}
                    </div>
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={7}>
                      <div className="detail-panel">
                        <div className="detail-grid">
                          <div>
                            <strong>Empresa</strong>
                            <p>{comp?.razao_social || '—'}</p>
                          </div>
                          {unit && (
                            <div>
                              <strong>{unit.tipo}</strong>
                              <p>{unit.nome}</p>
                            </div>
                          )}
                          <div>
                            <strong>Deslocamento</strong>
                            <p>{money(budget.deslocamento)}</p>
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
                          <p>{money(budget.total)} ({money(budget.pecas_total)} peça + {money(budget.deslocamento)} visita técnica)</p>
                        </div>

                        {budget.motivo_troca && (
                          <div className="detail-report">
                            <strong>Motivo da troca</strong>
                            <p>{budget.motivo_troca}</p>
                          </div>
                        )}
                        {budget.observacoes_tecnicas && (
                          <div className="detail-report">
                            <strong>Informações relevantes</strong>
                            <p>{budget.observacoes_tecnicas}</p>
                          </div>
                        )}

                        {budget.status === 'Aprovado' && (
                          <div className="detail-report">
                            <strong>STATUS: APROVADO PELO CLIENTE</strong>
                            <p>
                              REALIZADO: Substituição da(s) peça(s) {budget.items?.map((item) => partName(item.peca_id)).join(', ')} e realização dos procedimentos técnicos necessários para conclusão do serviço.
                            </p>
                            <p className="detail-muted">
                              Autorizado por: {budget.autorizado_por || '—'}{budget.aprovado_em && ` em ${new Date(budget.aprovado_em).toLocaleString('pt-BR')}`}
                            </p>
                            {budget.milvus_codigo && <p className="detail-muted">Ticket Milvus: #{budget.milvus_codigo}</p>}
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
