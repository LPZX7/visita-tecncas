import { useEffect, useState } from 'react';
import api from '../api';

const emptyForm = { razao_social: '', nome_fantasia: '', cnpj: '', inscricao_estadual: '', email: '', telefone: '', status: 'ativo' };

export default function Companies() {
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = () => api.get('/companies').then((res) => setCompanies(res.data));

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!form.razao_social.trim() || !form.cnpj.trim()) {
      setError('Preencha os campos obrigatórios: Razão Social e CNPJ.');
      return;
    }
    try {
      if (editingId) {
        await api.put(`/companies/${editingId}`, form);
        setSuccess('Empresa atualizada com sucesso.');
      } else {
        await api.post('/companies', form);
        setSuccess('Empresa cadastrada com sucesso.');
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
    setSuccess('');
    setError('');
    setForm({
      razao_social: company.razao_social || '',
      nome_fantasia: company.nome_fantasia || '',
      cnpj: company.cnpj || '',
      inscricao_estadual: company.inscricao_estadual || '',
      email: company.email || '',
      telefone: company.telefone || '',
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
      setSuccess('Empresa excluída.');
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao excluir empresa');
    }
  };

  return (
    <div>
      <h2 className="page-title">Cadastrar Empresa</h2>

      <form onSubmit={handleSubmit} className="card-form">
        <h3>{editingId ? 'Editar empresa' : 'Nova empresa'}</h3>
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}
        <label className="form-field">Razão Social<input className="form-input" value={form.razao_social} onChange={(e) => setForm({ ...form, razao_social: e.target.value })} required /></label>
        <label className="form-field">Nome Fantasia<input className="form-input" value={form.nome_fantasia} onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })} /></label>
        <label className="form-field">CNPJ<input className="form-input" value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} required /></label>
        <label className="form-field">Inscrição Estadual<input className="form-input" value={form.inscricao_estadual} onChange={(e) => setForm({ ...form, inscricao_estadual: e.target.value })} /></label>
        <label className="form-field">E-mail<input className="form-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label className="form-field">Telefone<input className="form-input" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></label>
        <label className="form-field">Status
          <select className="form-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="ativo">Ativa</option>
            <option value="inativo">Inativa</option>
          </select>
        </label>
        <div className="row-actions">
          <button type="submit" className="btn btn-primary">{editingId ? 'Salvar alterações' : 'Cadastrar empresa'}</button>
          {editingId && <button type="button" className="btn btn-outline" onClick={handleCancelEdit}>Cancelar</button>}
        </div>
      </form>

      <table className="data-table">
        <thead>
          <tr>
            <th>Razão social</th>
            <th>CNPJ</th>
            <th>Inscrição estadual</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {companies.map((company) => (
            <tr key={company.id}>
              <td>{company.razao_social}</td>
              <td>{company.cnpj}</td>
              <td>{company.inscricao_estadual || '—'}</td>
              <td><span className={`badge badge-${company.status}`}>{company.status === 'ativo' ? 'Ativa' : 'Inativa'}</span></td>
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
