import { useEffect, useState } from 'react';
import api from '../api';

const emptyForm = { codigo: '', nome: '', categoria: '', preco_unitario: '', estoque: '', fornecedor: '' };

export default function Parts() {
  const [parts, setParts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  const load = () => api.get('/parts').then((res) => setParts(res.data));

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const payload = { ...form, preco_unitario: parseFloat(form.preco_unitario), estoque: parseInt(form.estoque, 10) || 0 };
    try {
      if (editingId) {
        await api.put(`/parts/${editingId}`, payload);
      } else {
        await api.post('/parts', payload);
      }
      await load();
      setForm(emptyForm);
      setEditingId(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar peça');
    }
  };

  const handleEdit = (part) => {
    setEditingId(part.id);
    setForm({
      codigo: part.codigo || '',
      nome: part.nome || '',
      categoria: part.categoria || '',
      preco_unitario: String(part.preco_unitario ?? ''),
      estoque: String(part.estoque ?? ''),
      fornecedor: part.fornecedor || ''
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Excluir esta peça?')) return;
    try {
      await api.delete(`/parts/${id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao excluir peça');
    }
  };

  return (
    <div>
      <h2 className="page-title">Catálogo de Peças</h2>

      <form onSubmit={handleSubmit} className="card-form">
        <h3>{editingId ? 'Editar peça' : 'Nova peça'}</h3>
        {error && <div className="alert alert-error">{error}</div>}
        <label className="form-field">Código<input className="form-input" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} required /></label>
        <label className="form-field">Nome<input className="form-input" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required /></label>
        <label className="form-field">Categoria<input className="form-input" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} required /></label>
        <label className="form-field">Preço unitário<input className="form-input" type="number" step="0.01" value={form.preco_unitario} onChange={(e) => setForm({ ...form, preco_unitario: e.target.value })} required /></label>
        <label className="form-field">Estoque<input className="form-input" type="number" value={form.estoque} onChange={(e) => setForm({ ...form, estoque: e.target.value })} /></label>
        <label className="form-field">Fornecedor<input className="form-input" value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} /></label>
        <div className="row-actions">
          <button type="submit" className="btn btn-primary">{editingId ? 'Salvar alterações' : 'Criar peça'}</button>
          {editingId && <button type="button" className="btn btn-outline" onClick={handleCancelEdit}>Cancelar</button>}
        </div>
      </form>

      <table className="data-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Nome</th>
            <th>Preço</th>
            <th>Estoque</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {parts.map((part) => (
            <tr key={part.id}>
              <td>{part.codigo}</td>
              <td>{part.nome}</td>
              <td>R$ {part.preco_unitario.toFixed(2)}</td>
              <td>{part.estoque}</td>
              <td>
                <div className="row-actions">
                  <button className="btn btn-outline btn-sm" onClick={() => handleEdit(part)}>Editar</button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(part.id)}>Excluir</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
