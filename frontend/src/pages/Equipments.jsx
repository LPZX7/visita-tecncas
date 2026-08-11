import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import SearchableSelect from '../components/SearchableSelect';
import Pagination from '../components/Pagination';

const emptyForm = { empresa_id: '', unidade_id: '', modelo: '', numero_serie: '', local_instalacao: '', data_instalacao: '', garantia_ate: '' };
const PAGE_SIZE = 25;

export default function Equipments() {
  const [equipments, setEquipments] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [units, setUnits] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);

  const load = () => {
    api.get('/equipments').then((res) => setEquipments(res.data));
    api.get('/companies').then((res) => setCompanies(res.data));
    api.get('/units').then((res) => setUnits(res.data));
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const companyName = (id) => companies.find((c) => c.id === id)?.razao_social || '—';
  const unitName = (id) => units.find((u) => u.id === id)?.nome || null;
  const unitsForSelectedCompany = units.filter((u) => u.empresa_id === form.empresa_id && u.status !== 'inativo');

  const filteredEquipments = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return equipments;
    return equipments.filter((eq) =>
      eq.modelo.toLowerCase().includes(q) ||
      eq.numero_serie.toLowerCase().includes(q) ||
      companyName(eq.empresa_id).toLowerCase().includes(q) ||
      (eq.local_instalacao || '').toLowerCase().includes(q)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipments, companies, search]);

  const totalPages = Math.max(1, Math.ceil(filteredEquipments.length / PAGE_SIZE));
  const pageItems = filteredEquipments.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingId) {
        await api.put(`/equipments/${editingId}`, form);
      } else {
        await api.post('/equipments', form);
      }
      await load();
      setForm(emptyForm);
      setEditingId(null);
      setShowForm(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar equipamento');
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setShowForm(true);
  };

  const handleEdit = (equipment) => {
    setEditingId(equipment.id);
    setError('');
    setForm({
      empresa_id: equipment.empresa_id || '',
      unidade_id: equipment.unidade_id || '',
      modelo: equipment.modelo || '',
      numero_serie: equipment.numero_serie || '',
      local_instalacao: equipment.local_instalacao || '',
      data_instalacao: equipment.data_instalacao || '',
      garantia_ate: equipment.garantia_ate || ''
    });
    setShowForm(true);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Excluir este equipamento?')) return;
    try {
      await api.delete(`/equipments/${id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao excluir equipamento');
    }
  };

  return (
    <div>
      <h2 className="page-title">Equipamentos</h2>

      {!showForm && (
        <div className="row-actions" style={{ marginBottom: 20 }}>
          <button type="button" className="btn btn-primary" onClick={openCreate}>+ Criar Equipamento</button>
        </div>
      )}

      {error && !showForm && <div className="alert alert-error" style={{ maxWidth: 720, marginBottom: 20 }}>{error}</div>}

      {showForm && (
        <form onSubmit={handleSubmit} className="card-form">
          <h3>{editingId ? 'Editar equipamento' : 'Novo equipamento'}</h3>
          {error && <div className="alert alert-error">{error}</div>}
          <label className="form-field">Empresa
            <SearchableSelect
              value={form.empresa_id}
              onChange={(id) => setForm({ ...form, empresa_id: id, unidade_id: '' })}
              placeholder="Digite para buscar a empresa..."
              options={companies.map((company) => ({ value: company.id, label: company.razao_social, sublabel: company.cnpj }))}
            />
          </label>
          {form.empresa_id && unitsForSelectedCompany.length > 0 && (
            <label className="form-field">Unidade (opcional — deixe em branco para sede principal)
              <SearchableSelect
                value={form.unidade_id}
                onChange={(id) => setForm({ ...form, unidade_id: id })}
                placeholder="Digite para buscar a filial..."
                options={unitsForSelectedCompany.map((unit) => ({
                  value: unit.id,
                  label: `${unit.tipo} — ${unit.nome}`,
                  sublabel: [unit.endereco, unit.cidade && unit.estado ? `${unit.cidade}/${unit.estado}` : unit.cidade].filter(Boolean).join(', ')
                }))}
              />
            </label>
          )}
          <label className="form-field">Modelo<input className="form-input" value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} required /></label>
          <label className="form-field">Número de série<input className="form-input" value={form.numero_serie} onChange={(e) => setForm({ ...form, numero_serie: e.target.value })} required /></label>
          <label className="form-field">Local instalação<input className="form-input" value={form.local_instalacao} onChange={(e) => setForm({ ...form, local_instalacao: e.target.value })} /></label>
          <label className="form-field">Data instalação<input className="form-input" type="date" value={form.data_instalacao} onChange={(e) => setForm({ ...form, data_instalacao: e.target.value })} /></label>
          <label className="form-field">Garantia até<input className="form-input" type="date" value={form.garantia_ate} onChange={(e) => setForm({ ...form, garantia_ate: e.target.value })} /></label>
          <div className="row-actions">
            <button type="submit" className="btn btn-primary">{editingId ? 'Salvar alterações' : 'Criar equipamento'}</button>
            <button type="button" className="btn btn-outline" onClick={handleCancelEdit}>Cancelar</button>
          </div>
        </form>
      )}

      <div className="list-controls" style={{ marginTop: 20 }}>
        <input
          className="form-input search-input"
          placeholder="Pesquisar por modelo, série, empresa ou local..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>Modelo</th>
            <th>Nº série</th>
            <th>Empresa</th>
            <th>Unidade</th>
            <th>Local</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pageItems.length === 0 ? (
            <tr><td colSpan={6} className="section-text">Nenhum equipamento encontrado.</td></tr>
          ) : (
            pageItems.map((equipment) => (
              <tr key={equipment.id}>
                <td>{equipment.modelo}</td>
                <td>{equipment.numero_serie}</td>
                <td>{companyName(equipment.empresa_id)}</td>
                <td>{unitName(equipment.unidade_id) || '—'}</td>
                <td>{equipment.local_instalacao}</td>
                <td>
                  <div className="row-actions">
                    <button className="btn btn-outline btn-sm" onClick={() => handleEdit(equipment)}>Editar</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(equipment.id)}>Excluir</button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}
