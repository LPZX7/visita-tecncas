import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import ImportPanel from '../components/ImportPanel';
import Pagination from '../components/Pagination';

const emptyForm = { razao_social: '', nome_fantasia: '', cnpj: '', inscricao_estadual: '', email: '', telefone: '', status: 'ativo' };
const PAGE_SIZE = 25;

export default function Companies() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState([]);
  const [units, setUnits] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const addressForCompany = (company) => {
    if (company.endereco) return company.endereco;
    const companyUnits = units.filter((u) => u.empresa_id === company.id);
    const unit = companyUnits.find((u) => u.tipo === 'Sede') || companyUnits[0];
    if (!unit) return '';
    return [unit.endereco, unit.numero, unit.cidade && unit.estado ? `${unit.cidade}/${unit.estado}` : unit.cidade].filter(Boolean).join(', ');
  };

  const filteredCompanies = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) =>
      c.razao_social.toLowerCase().includes(q) ||
      (c.nome_fantasia || '').toLowerCase().includes(q) ||
      (c.cnpj || '').toLowerCase().includes(q) ||
      addressForCompany(c).toLowerCase().includes(q)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies, units, search]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const totalPages = Math.max(1, Math.ceil(filteredCompanies.length / PAGE_SIZE));
  const pageItems = filteredCompanies.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const load = () => {
    api.get('/companies').then((res) => setCompanies(res.data));
    api.get('/units').then((res) => setUnits(res.data)).catch(() => {});
  };

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
      setShowForm(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar empresa');
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setSuccess('');
    setShowForm(true);
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
    setShowForm(true);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(false);
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

  const handleImport = async (rows) => {
    let successCount = 0;
    const errors = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.razao_social || !r.cnpj) {
        errors.push({ row: i + 2, message: 'Razão social e CNPJ são obrigatórios.' });
        continue;
      }
      try {
        await api.post('/companies', {
          razao_social: r.razao_social,
          nome_fantasia: r.nome_fantasia || '',
          cnpj: r.cnpj,
          inscricao_estadual: r.inscricao_estadual || '',
          email: r.email || '',
          telefone: r.telefone || '',
          status: r.status === 'inativo' ? 'inativo' : 'ativo'
        });
        successCount++;
      } catch (err) {
        errors.push({ row: i + 2, message: err.response?.data?.error || 'Erro ao importar' });
      }
    }
    await load();
    return { success: successCount, errors };
  };

  return (
    <div>
      <h2 className="page-title">Cadastrar Empresa</h2>

      {!showForm && (
        <div className="row-actions" style={{ marginBottom: 20 }}>
          <button type="button" className="btn btn-primary" onClick={openCreate}>+ Criar Empresa</button>
        </div>
      )}

      {error && !showForm && <div className="alert alert-error" style={{ maxWidth: 720, marginBottom: 20 }}>{error}</div>}
      {success && !showForm && <div className="alert alert-success" style={{ maxWidth: 720, marginBottom: 20 }}>{success}</div>}

      {showForm && (
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
            <button type="button" className="btn btn-outline" onClick={handleCancelEdit}>Cancelar</button>
          </div>
        </form>
      )}

      <ImportPanel
        title="Importar empresas em massa"
        hint="Envie um CSV com as colunas: razao_social, nome_fantasia, cnpj, inscricao_estadual, email, telefone, status (ativo/inativo)."
        templateHeaders={['razao_social', 'nome_fantasia', 'cnpj', 'inscricao_estadual', 'email', 'telefone', 'status']}
        templateExample={['Empresa Exemplo LTDA', 'Exemplo', '12.345.678/0001-90', '123456789', 'contato@exemplo.com', '(11) 99999-0000', 'ativo']}
        onImport={handleImport}
      />

      <div className="list-controls" style={{ marginBottom: 12 }}>
        <input
          className="form-input search-input"
          placeholder="Pesquisar empresa..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>Razão social</th>
            <th>CNPJ</th>
            <th>Endereço</th>
            <th>Inscrição estadual</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filteredCompanies.length === 0 ? (
            <tr><td colSpan={6} className="section-text">Nenhuma empresa encontrada para "{search}".</td></tr>
          ) : (
            pageItems.map((company) => (
              <tr key={company.id}>
                <td>{company.razao_social}</td>
                <td>{company.cnpj}</td>
                <td>{addressForCompany(company) || '—'}</td>
                <td>{company.inscricao_estadual || '—'}</td>
                <td><span className={`badge badge-${company.status}`}>{company.status === 'ativo' ? 'Ativa' : 'Inativa'}</span></td>
                <td>
                  <div className="row-actions">
                    <button className="btn btn-outline btn-sm" onClick={() => navigate(`/companies/sede?empresa_id=${company.id}&criar=1`)}>Cadastrar Sede</button>
                    <button className="btn btn-outline btn-sm" onClick={() => navigate(`/companies/filial?empresa_id=${company.id}&criar=1`)}>Cadastrar Filial</button>
                    <button className="btn btn-outline btn-sm" onClick={() => handleEdit(company)}>Editar</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(company.id)}>Excluir</button>
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
