import { useEffect, useState } from 'react';
import api from '../api';

const emptyForm = { empresa_id: '', modelo: '', numero_serie: '', local_instalacao: '', data_instalacao: '', garantia_ate: '' };

export default function Equipments() {
  const [equipments, setEquipments] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    api.get('/equipments').then((res) => setEquipments(res.data));
    api.get('/companies').then((res) => setCompanies(res.data));
  };

  useEffect(() => {
    load();
  }, []);

  const companyName = (id) => companies.find((c) => c.id === id)?.razao_social || '—';

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
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar equipamento');
    }
  };

  const handleEdit = (equipment) => {
    setEditingId(equipment.id);
    setForm({
      empresa_id: equipment.empresa_id || '',
      modelo: equipment.modelo || '',
      numero_serie: equipment.numero_serie || '',
      local_instalacao: equipment.local_instalacao || '',
      data_instalacao: equipment.data_instalacao || '',
      garantia_ate: equipment.garantia_ate || ''
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
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

      <form onSubmit={handleSubmit} className="card-form">
        <h3>{editingId ? 'Editar equipamento' : 'Novo equipamento'}</h3>
        {error && <div className="alert alert-error">{error}</div>}
        <label className="form-field">Empresa
          <select className="form-select" value={form.empresa_id} onChange={(e) => setForm({ ...form, empresa_id: e.target.value })} required>
            <option value="">Selecione</option>
            {companies.map((company) => (<option key={company.id} value={company.id}>{company.razao_social}</option>))}
          </select>
        </label>
        <label className="form-field">Modelo<input className="form-input" value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} required /></label>
        <label className="form-field">Número de série<input className="form-input" value={form.numero_serie} onChange={(e) => setForm({ ...form, numero_serie: e.target.value })} required /></label>
        <label className="form-field">Local instalação<input className="form-input" value={form.local_instalacao} onChange={(e) => setForm({ ...form, local_instalacao: e.target.value })} /></label>
        <label className="form-field">Data instalação<input className="form-input" type="date" value={form.data_instalacao} onChange={(e) => setForm({ ...form, data_instalacao: e.target.value })} /></label>
        <label className="form-field">Garantia até<input className="form-input" type="date" value={form.garantia_ate} onChange={(e) => setForm({ ...form, garantia_ate: e.target.value })} /></label>
        <div className="row-actions">
          <button type="submit" className="btn btn-primary">{editingId ? 'Salvar alterações' : 'Criar equipamento'}</button>
          {editingId && <button type="button" className="btn btn-outline" onClick={handleCancelEdit}>Cancelar</button>}
        </div>
      </form>

      <table className="data-table">
        <thead>
          <tr>
            <th>Modelo</th>
            <th>Nº série</th>
            <th>Empresa</th>
            <th>Local</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {equipments.map((equipment) => (
            <tr key={equipment.id}>
              <td>{equipment.modelo}</td>
              <td>{equipment.numero_serie}</td>
              <td>{companyName(equipment.empresa_id)}</td>
              <td>{equipment.local_instalacao}</td>
              <td>
                <div className="row-actions">
                  <button className="btn btn-outline btn-sm" onClick={() => handleEdit(equipment)}>Editar</button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(equipment.id)}>Excluir</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
