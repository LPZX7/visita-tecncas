import { useEffect, useState } from 'react';
import api from '../api';
import MapLink from '../components/MapLink';

const emptyForm = { razao_social: '', nome_fantasia: '', cnpj: '', endereco: '', telefone: '', email: '', responsavel: '', modelo_cobranca: 'avulsa', status: 'ativo' };

export default function Companies() {
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  const load = () => api.get('/companies').then((res) => setCompanies(res.data));

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
            <th>Razão social</th>
            <th>CNPJ</th>
            <th>Endereço</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {companies.map((company) => (
            <tr key={company.id}>
              <td>{company.razao_social}</td>
              <td>{company.cnpj}</td>
              <td><MapLink address={company.endereco} /></td>
              <td><span className={`badge badge-${company.status}`}>{company.status}</span></td>
              <td>
                <div className="row-actions">
                  <button className="btn btn-outline btn-sm" onClick={() => handleEdit(company)}>Editar</button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(company.id)}>Excluir</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
