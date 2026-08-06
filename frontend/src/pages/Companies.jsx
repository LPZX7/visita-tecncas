import { Fragment, useEffect, useState } from 'react';
import api from '../api';
import MapLink from '../components/MapLink';

const emptyForm = { razao_social: '', nome_fantasia: '', cnpj: '', endereco: '', telefone: '', email: '', responsavel: '', modelo_cobranca: 'avulsa', status: 'ativo' };
const emptyUnitForm = { nome: '', tipo: 'Filial', endereco: '', telefone: '', responsavel: '' };

export default function Companies() {
  const [companies, setCompanies] = useState([]);
  const [units, setUnits] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [unitForm, setUnitForm] = useState(emptyUnitForm);
  const [editingUnitId, setEditingUnitId] = useState(null);
  const [unitError, setUnitError] = useState('');

  const load = () => {
    api.get('/companies').then((res) => setCompanies(res.data));
    api.get('/units').then((res) => setUnits(res.data));
  };

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingId) {
        await api.put(`/companies/${editingId}`, form);
      } else {
        await api.post('/companies', form);
      }
      await load();
      setForm(emptyForm);
      setEditingId(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar empresa');
    }
  };

  const handleEdit = (company) => {
    setEditingId(company.id);
    setForm({
      razao_social: company.razao_social || '',
      nome_fantasia: company.nome_fantasia || '',
      cnpj: company.cnpj || '',
      endereco: company.endereco || '',
      telefone: company.telefone || '',
      email: company.email || '',
      responsavel: company.responsavel || '',
      modelo_cobranca: company.modelo_cobranca || 'avulsa',
      status: company.status || 'ativo'
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Excluir esta empresa?')) return;
    try {
      await api.delete(`/companies/${id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao excluir empresa');
    }
  };

  const toggleExpand = (companyId) => {
    setExpandedId((prev) => (prev === companyId ? null : companyId));
    setEditingUnitId(null);
    setUnitForm(emptyUnitForm);
    setUnitError('');
  };

  const unitsForCompany = (companyId) => units.filter((u) => u.empresa_id === companyId);

  const handleUnitSubmit = async (e, companyId) => {
    e.preventDefault();
    setUnitError('');
    try {
      if (editingUnitId) {
        await api.put(`/units/${editingUnitId}`, unitForm);
      } else {
        await api.post('/units', { ...unitForm, empresa_id: companyId });
      }
      const res = await api.get('/units');
      setUnits(res.data);
      setUnitForm(emptyUnitForm);
      setEditingUnitId(null);
    } catch (err) {
      setUnitError(err.response?.data?.error || 'Erro ao salvar unidade');
    }
  };

  const handleUnitEdit = (unit) => {
    setEditingUnitId(unit.id);
    setUnitForm({
      nome: unit.nome || '',
      tipo: unit.tipo || 'Filial',
      endereco: unit.endereco || '',
      telefone: unit.telefone || '',
      responsavel: unit.responsavel || ''
    });
  };

  const handleUnitCancelEdit = () => {
    setEditingUnitId(null);
    setUnitForm(emptyUnitForm);
  };

  const handleUnitDelete = async (id) => {
    if (!window.confirm('Excluir esta unidade?')) return;
    try {
      await api.delete(`/units/${id}`);
      const res = await api.get('/units');
      setUnits(res.data);
    } catch (err) {
      setUnitError(err.response?.data?.error || 'Erro ao excluir unidade');
    }
  };

  return (
    <div>
      <h2 className="page-title">Empresas</h2>

      <form onSubmit={handleSubmit} className="card-form">
        <h3>{editingId ? 'Editar empresa' : 'Nova empresa'}</h3>
        {error && <div className="alert alert-error">{error}</div>}
        <label className="form-field">Razão social<input className="form-input" value={form.razao_social} onChange={(e) => setForm({ ...form, razao_social: e.target.value })} required /></label>
        <label className="form-field">Nome fantasia<input className="form-input" value={form.nome_fantasia} onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })} /></label>
        <label className="form-field">CNPJ<input className="form-input" value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} required /></label>
        <label className="form-field">Endereço<input className="form-input" value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} required /></label>
        <label className="form-field">Telefone<input className="form-input" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></label>
        <label className="form-field">Email<input className="form-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label className="form-field">Responsável<input className="form-input" value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} /></label>
        <label className="form-field">Modelo de cobrança
          <select className="form-select" value={form.modelo_cobranca} onChange={(e) => setForm({ ...form, modelo_cobranca: e.target.value })}>
            <option value="avulsa">Avulsa</option>
            <option value="contrato">Contrato</option>
          </select>
        </label>
        <label className="form-field">Status
          <select className="form-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </select>
        </label>
        <div className="row-actions">
          <button type="submit" className="btn btn-primary">{editingId ? 'Salvar alterações' : 'Criar empresa'}</button>
          {editingId && <button type="button" className="btn btn-outline" onClick={handleCancelEdit}>Cancelar</button>}
        </div>
      </form>

      <table className="data-table">
        <thead>
          <tr>
            <th></th>
            <th>Razão social</th>
            <th>CNPJ</th>
            <th>Endereço</th>
            <th>Unidades</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {companies.map((company) => {
            const companyUnits = unitsForCompany(company.id);
            const isExpanded = expandedId === company.id;
            return (
              <Fragment key={company.id}>
                <tr>
                  <td>
                    <button type="button" className="row-expand-btn" onClick={() => toggleExpand(company.id)} aria-label={isExpanded ? 'Recolher' : 'Expandir'}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }}>
                        <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </td>
                  <td>{company.razao_social}</td>
                  <td>{company.cnpj}</td>
                  <td><MapLink address={company.endereco} /></td>
                  <td>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => toggleExpand(company.id)}>
                      {companyUnits.length} unidade{companyUnits.length === 1 ? '' : 's'}
                    </button>
                  </td>
                  <td><span className={`badge badge-${company.status}`}>{company.status}</span></td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-outline btn-sm" onClick={() => handleEdit(company)}>Editar</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(company.id)}>Excluir</button>
                    </div>
                  </td>
                </tr>
                {isExpanded && (
                  <tr>
                    <td></td>
                    <td colSpan={6}>
                      <div className="units-panel">
                        <h4>Sedes e filiais de {company.razao_social}</h4>
                        {unitError && <div className="alert alert-error">{unitError}</div>}

                        {companyUnits.length === 0 ? (
                          <p className="section-text" style={{ marginTop: 0 }}>Nenhuma unidade cadastrada ainda — todo equipamento fica direto na empresa até você criar uma.</p>
                        ) : (
                          <ul className="units-list">
                            {companyUnits.map((unit) => (
                              <li key={unit.id}>
                                <div>
                                  <span className={`badge ${unit.tipo === 'Sede' ? 'badge-ativo' : 'badge-agendada'}`}>{unit.tipo}</span>
                                  <strong>{unit.nome}</strong>
                                  {unit.endereco && <span className="units-list__meta">{unit.endereco}</span>}
                                  {unit.responsavel && <span className="units-list__meta">Responsável: {unit.responsavel}</span>}
                                </div>
                                <div className="row-actions">
                                  <button type="button" className="btn btn-outline btn-sm" onClick={() => handleUnitEdit(unit)}>Editar</button>
                                  <button type="button" className="btn btn-danger btn-sm" onClick={() => handleUnitDelete(unit.id)}>Excluir</button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}

                        <form onSubmit={(e) => handleUnitSubmit(e, company.id)} className="units-form">
                          <input className="form-input" placeholder="Nome da unidade (ex: Loja Centro)" value={unitForm.nome} onChange={(e) => setUnitForm({ ...unitForm, nome: e.target.value })} required />
                          <select className="form-select" value={unitForm.tipo} onChange={(e) => setUnitForm({ ...unitForm, tipo: e.target.value })}>
                            <option value="Sede">Sede</option>
                            <option value="Filial">Filial</option>
                          </select>
                          <input className="form-input" placeholder="Endereço" value={unitForm.endereco} onChange={(e) => setUnitForm({ ...unitForm, endereco: e.target.value })} />
                          <input className="form-input" placeholder="Telefone" value={unitForm.telefone} onChange={(e) => setUnitForm({ ...unitForm, telefone: e.target.value })} />
                          <input className="form-input" placeholder="Responsável" value={unitForm.responsavel} onChange={(e) => setUnitForm({ ...unitForm, responsavel: e.target.value })} />
                          <div className="row-actions">
                            <button type="submit" className="btn btn-primary btn-sm">{editingUnitId ? 'Salvar' : 'Adicionar unidade'}</button>
                            {editingUnitId && <button type="button" className="btn btn-outline btn-sm" onClick={handleUnitCancelEdit}>Cancelar</button>}
                          </div>
                        </form>
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
