import { useEffect, useState } from 'react';
import api from '../api';

const emptyForm = { empresa_id: '', tipo: 'avulsa', valor_base: '', visitas_incluidas: '' };

export default function Rules() {
  const [rules, setRules] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    api.get('/rules').then((res) => setRules(res.data));
    api.get('/companies').then((res) => setCompanies(res.data));
  };

  useEffect(() => {
    load();
  }, []);

  const companyName = (id) => companies.find((c) => c.id === id)?.razao_social || '—';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const payload = { ...form, valor_base: parseFloat(form.valor_base), visitas_incluidas: parseInt(form.visitas_incluidas, 10) || 0 };
    try {
      if (editingId) {
        await api.put(`/rules/${editingId}`, payload);
      } else {
        await api.post('/rules', payload);
      }
      await load();
      setForm(emptyForm);
      setEditingId(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar regra');
    }
  };

  const handleEdit = (rule) => {
    setEditingId(rule.id);
    setForm({
      empresa_id: rule.empresa_id || '',
      tipo: rule.tipo || 'avulsa',
      valor_base: String(rule.valor_base ?? ''),
      visitas_incluidas: String(rule.visitas_incluidas ?? '')
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Excluir esta regra?')) return;
    try {
      await api.delete(`/rules/${id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao excluir regra');
    }
  };

  return (
    <div>
      <h2 className="page-title">Regras de Cobrança</h2>

      <form onSubmit={handleSubmit} className="card-form">
        <h3>{editingId ? 'Editar regra' : 'Nova regra'}</h3>
        {error && <div className="alert alert-error">{error}</div>}
        <label className="form-field">Empresa
          <select className="form-select" value={form.empresa_id} onChange={(e) => setForm({ ...form, empresa_id: e.target.value })} required>
            <option value="">Selecione</option>
            {companies.map((company) => (<option key={company.id} value={company.id}>{company.razao_social}</option>))}
          </select>
        </label>
        <label className="form-field">Tipo
          <select className="form-select" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
            <option value="avulsa">Avulsa</option>
            <option value="contrato">Contrato</option>
            <option value="deslocamento">Deslocamento</option>
            <option value="urgencia">Urgência</option>
          </select>
        </label>
        <label className="form-field">Valor base<input className="form-input" type="number" step="0.01" value={form.valor_base} onChange={(e) => setForm({ ...form, valor_base: e.target.value })} required /></label>
        <label className="form-field">Visitas incluídas<input className="form-input" type="number" value={form.visitas_incluidas} onChange={(e) => setForm({ ...form, visitas_incluidas: e.target.value })} /></label>
        <div className="row-actions">
          <button type="submit" className="btn btn-primary">{editingId ? 'Salvar alterações' : 'Criar regra'}</button>
          {editingId && <button type="button" className="btn btn-outline" onClick={handleCancelEdit}>Cancelar</button>}
        </div>
      </form>

      <table className="data-table">
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Empresa</th>
            <th>Valor base</th>
            <th>Visitas incluídas</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => (
            <tr key={rule.id}>
              <td>{rule.tipo}</td>
              <td>{companyName(rule.empresa_id)}</td>
              <td>R$ {Number(rule.valor_base).toFixed(2)}</td>
              <td>{rule.visitas_incluidas}</td>
              <td>
                <div className="row-actions">
                  <button className="btn btn-outline btn-sm" onClick={() => handleEdit(rule)}>Editar</button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(rule.id)}>Excluir</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
