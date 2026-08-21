import { useEffect, useState } from 'react';
import api from '../api';

const emptyForm = { codigo: '', nome: '', categoria: '', preco_unitario: '', estoque: '', fornecedor: '' };

export default function Parts() {
  const [parts, setParts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Todas');
  const [origin, setOrigin] = useState('Todas');

  const load = () => api.get('/parts').then((res) => setParts(res.data));

  useEffect(() => {
    load();
    api.get('/parts/bomcontrole/status').then((res) => setSyncStatus(res.data)).catch(() => {});
  }, []);

  const syncBomControle = async () => {
    setError('');
    setSuccess('');
    setSyncing(true);
    try {
      const res = await api.post('/parts/bomcontrole/sync');
      setSyncStatus({ ...res.data, configured: true });
      setSuccess(`Estoque atualizado: ${res.data.created} produto(s) novo(s) e ${res.data.updated} atualizado(s).`);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível sincronizar o estoque do BomControle.');
    } finally {
      setSyncing(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const payload = { ...form, preco_unitario: Number(form.preco_unitario) || 0, estoque: parseInt(form.estoque, 10) || 0 };
    try {
      if (editingId) {
        await api.put(`/parts/${editingId}`, payload);
      } else {
        await api.post('/parts', payload);
      }
      await load();
      setForm(emptyForm);
      setEditingId(null);
      setShowForm(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar peça');
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setShowForm(true);
  };

  const handleEdit = (part) => {
    setEditingId(part.id);
    setError('');
    setForm({
      codigo: part.codigo || '',
      nome: part.nome || '',
      categoria: part.categoria || '',
      preco_unitario: String(part.preco_unitario ?? ''),
      estoque: String(part.estoque ?? ''),
      fornecedor: part.fornecedor || ''
    });
    setShowForm(true);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(false);
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

  const categories = ['Todas', ...new Set(parts.map((part) => part.categoria).filter(Boolean))];
  const filteredParts = parts.filter((part) => {
    const text = `${part.codigo} ${part.nome} ${part.categoria}`.toLowerCase();
    const matchesSearch = text.includes(search.toLowerCase().trim());
    const matchesCategory = category === 'Todas' || part.categoria === category;
    const matchesOrigin = origin === 'Todas' || (origin === 'BomControle' ? part.bomcontrole_id : !part.bomcontrole_id);
    return matchesSearch && matchesCategory && matchesOrigin;
  });
  const totalStock = parts.reduce((sum, part) => sum + Number(part.estoque || 0), 0);
  const stockedItems = parts.filter((part) => Number(part.estoque) > 0).length;
  const pendingPrices = parts.filter((part) => Number(part.preco_unitario) === 0).length;

  return (
    <div className="parts-page">
      <div className="page-header parts-hero">
        <div>
          <span className="page-eyebrow">ESTOQUE E MANUTENÇÃO</span>
          <h2 className="page-title">Catálogo de Peças</h2>
          <p className="section-text">Componentes para manutenção de catracas e itens sincronizados com o BomControle.</p>
        </div>
      </div>

      <div className="parts-summary">
        <article><span>Itens cadastrados</span><strong>{parts.length}</strong><small>catálogo completo</small></article>
        <article><span>Unidades em estoque</span><strong>{totalStock}</strong><small>{stockedItems} item(ns) disponível(is)</small></article>
        <article><span>Valores pendentes</span><strong>{pendingPrices}</strong><small>preencher quando definido</small></article>
        <article><span>Integração</span><strong>{syncStatus?.configured ? 'Ativa' : 'Manual'}</strong><small>BomControle</small></article>
      </div>

      {!showForm && (
        <div className="row-actions" style={{ marginBottom: 20 }}>
          <button type="button" className="btn btn-primary" onClick={openCreate}>+ Criar Peça</button>
          <button type="button" className="btn btn-outline" onClick={syncBomControle} disabled={syncing || syncStatus?.status === 'running'}>
            {syncing || syncStatus?.status === 'running' ? 'Sincronizando...' : 'Atualizar estoque do BomControle'}
          </button>
        </div>
      )}

      {error && !showForm && <div className="alert alert-error" style={{ maxWidth: 720, marginBottom: 20 }}>{error}</div>}
      {success && <div className="alert alert-success" role="status" style={{ maxWidth: 720, marginBottom: 20 }}>{success}</div>}
      {syncStatus?.syncedAt && !showForm && (
        <p className="section-text" style={{ marginBottom: 18 }}>
          Estoque sincronizado em {new Date(syncStatus.syncedAt).toLocaleString('pt-BR')} · atualização automática a cada 15 minutos.
        </p>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="card-form">
          <h3>{editingId ? 'Editar peça' : 'Nova peça'}</h3>
          {error && <div className="alert alert-error">{error}</div>}
          <label className="form-field">Código<input className="form-input" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} required /></label>
          <label className="form-field">Nome<input className="form-input" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required /></label>
          <label className="form-field">Categoria<input className="form-input" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} required /></label>
          <label className="form-field">Preço unitário (opcional)<input className="form-input" type="number" min="0" step="0.01" value={form.preco_unitario} onChange={(e) => setForm({ ...form, preco_unitario: e.target.value })} placeholder="Deixe vazio para definir depois" /></label>
          <label className="form-field">Estoque<input className="form-input" type="number" value={form.estoque} onChange={(e) => setForm({ ...form, estoque: e.target.value })} /></label>
          <label className="form-field">Fornecedor<input className="form-input" value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} /></label>
          <div className="row-actions">
            <button type="submit" className="btn btn-primary">{editingId ? 'Salvar alterações' : 'Criar peça'}</button>
            <button type="button" className="btn btn-outline" onClick={handleCancelEdit}>Cancelar</button>
          </div>
        </form>
      )}

      {!showForm && <div className="parts-toolbar panel-card">
        <input className="form-input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou código..." aria-label="Buscar peças" />
        <select className="form-select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filtrar por categoria">
          {categories.map((item) => <option key={item}>{item}</option>)}
        </select>
        <select className="form-select" value={origin} onChange={(e) => setOrigin(e.target.value)} aria-label="Filtrar por origem">
          <option>Todas</option><option>BomControle</option><option>Manual</option>
        </select>
        <span className="parts-results">{filteredParts.length} resultado(s)</span>
      </div>}

      <div className="parts-table-wrap">
      <table className="data-table parts-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Nome</th>
            <th>Preço</th>
            <th>Estoque</th>
            <th>Origem</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filteredParts.map((part) => (
            <tr key={part.id}>
              <td>{part.codigo}</td>
              <td><strong>{part.nome}</strong><small>{part.categoria}</small></td>
              <td>{Number(part.preco_unitario) > 0 ? `R$ ${Number(part.preco_unitario).toFixed(2)}` : <span className="price-pending">A definir</span>}</td>
              <td><span className={`stock-pill ${Number(part.estoque) > 0 ? 'has-stock' : 'no-stock'}`}>{part.estoque}</span></td>
              <td>{part.bomcontrole_id ? <span className="badge badge-aprovado">BomControle</span> : 'Manual'}</td>
              <td>
                <div className="row-actions">
                  {part.bomcontrole_id ? (
                    <span className="detail-muted">Gerenciado automaticamente</span>
                  ) : (
                    <>
                      <button className="btn btn-outline btn-sm" onClick={() => handleEdit(part)}>Editar</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(part.id)}>Excluir</button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {filteredParts.length === 0 && <tr><td colSpan="6"><div className="empty-state"><h4>Nenhuma peça encontrada</h4><p>Tente limpar os filtros ou buscar por outro termo.</p></div></td></tr>}
        </tbody>
      </table>
      </div>
    </div>
  );
}
