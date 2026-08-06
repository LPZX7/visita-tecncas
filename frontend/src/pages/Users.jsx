import { useEffect, useState } from 'react';
import api from '../api';
import { getUser } from '../utils/auth';

const emptyForm = { nome: '', email: '', senha: '', role: 'cliente', empresa_id: '' };

const ROLE_LABEL = {
  cliente: 'Cliente',
  tecnico: 'Técnico',
  analista: 'Analista',
  gestor: 'Gestor'
};

export default function Users() {
  const currentUser = getUser();
  const isGestor = currentUser?.role === 'gestor';
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({ role: 'cliente', empresa_id: '' });

  const load = () => {
    api.get('/users').then((res) => setUsers(res.data));
    api.get('/companies').then((res) => setCompanies(res.data)).catch(() => {});
  };

  useEffect(() => {
    load();
  }, []);

  const companyName = (id) => companies.find((c) => c.id === id)?.razao_social || '—';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/auth/register', { ...form, empresa_id: form.empresa_id || null });
      setForm(emptyForm);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao criar usuário');
    }
  };

  const toggleActive = async (user) => {
    try {
      await api.patch(`/users/${user.id}`, { ativo: !user.ativo });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao atualizar usuário');
    }
  };

  const startEdit = (user) => {
    setEditingId(user.id);
    setEditDraft({ role: user.role, empresa_id: user.empresa_id || '' });
  };

  const saveEdit = async (user) => {
    setError('');
    try {
      const payload = { empresa_id: editDraft.empresa_id || null };
      if (isGestor) payload.role = editDraft.role;
      await api.patch(`/users/${user.id}`, payload);
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao atualizar usuário');
    }
  };

  return (
    <div>
      <h2 className="page-title">Usuários</h2>

      <form onSubmit={handleSubmit} className="card-form">
        <h3>Novo usuário</h3>
        {error && <div className="alert alert-error">{error}</div>}
        <label className="form-field">Nome<input className="form-input" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required /></label>
        <label className="form-field">Email<input className="form-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
        <label className="form-field">Senha<input className="form-input" type="password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} required minLength={6} /></label>
        {isGestor ? (
          <label className="form-field">Perfil
            <select className="form-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="cliente">Cliente</option>
              <option value="tecnico">Técnico</option>
              <option value="analista">Analista</option>
              <option value="gestor">Gestor</option>
            </select>
          </label>
        ) : (
          <p className="section-text">Como analista, você só pode cadastrar usuários do tipo <strong>Cliente</strong>. Técnicos, analistas e gestores são cadastrados pelo gestor.</p>
        )}
        {(isGestor ? form.role === 'cliente' : true) && (
          <label className="form-field">Empresa
            <select className="form-select" value={form.empresa_id} onChange={(e) => setForm({ ...form, empresa_id: e.target.value })} required>
              <option value="">Selecione</option>
              {companies.map((company) => (<option key={company.id} value={company.id}>{company.razao_social}</option>))}
            </select>
          </label>
        )}
        <button type="submit" className="btn btn-primary">Criar usuário</button>
      </form>

      <table className="data-table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Email</th>
            <th>Perfil</th>
            <th>Empresa</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>{user.nome}</td>
              <td>{user.email}</td>
              <td>
                {editingId === user.id && isGestor ? (
                  <select className="form-select" value={editDraft.role} onChange={(e) => setEditDraft({ ...editDraft, role: e.target.value })}>
                    <option value="cliente">Cliente</option>
                    <option value="tecnico">Técnico</option>
                    <option value="analista">Analista</option>
                    <option value="gestor">Gestor</option>
                  </select>
                ) : (
                  ROLE_LABEL[user.role] || user.role
                )}
              </td>
              <td>
                {editingId === user.id ? (
                  <select className="form-select" value={editDraft.empresa_id} onChange={(e) => setEditDraft({ ...editDraft, empresa_id: e.target.value })}>
                    <option value="">Sem empresa</option>
                    {companies.map((company) => (<option key={company.id} value={company.id}>{company.razao_social}</option>))}
                  </select>
                ) : (
                  user.empresa_id ? companyName(user.empresa_id) : '—'
                )}
              </td>
              <td><span className={`badge ${user.ativo ? 'badge-ativo' : 'badge-inativo'}`}>{user.ativo ? 'Ativo' : 'Inativo'}</span></td>
              <td>
                <div className="row-actions">
                  {editingId === user.id ? (
                    <>
                      <button className="btn btn-primary btn-sm" onClick={() => saveEdit(user)}>Salvar</button>
                      <button className="btn btn-outline btn-sm" onClick={() => setEditingId(null)}>Cancelar</button>
                    </>
                  ) : (
                    <button className="btn btn-outline btn-sm" onClick={() => startEdit(user)}>Editar</button>
                  )}
                  <button className="btn btn-outline btn-sm" onClick={() => toggleActive(user)}>
                    {user.ativo ? 'Desativar' : 'Ativar'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
