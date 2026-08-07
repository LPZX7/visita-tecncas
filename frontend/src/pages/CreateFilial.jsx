import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../api';
import { fetchAddressByCep } from '../utils/cep';
import { normalizeDoc } from '../utils/csv';
import ImportPanel from '../components/ImportPanel';
import SearchableSelect from '../components/SearchableSelect';

const emptyForm = {
  nome: '', codigo: '', cnpj: '', cep: '', endereco: '', numero: '', complemento: '', bairro: '',
  cidade: '', estado: '', responsavel: '', telefone: '', email: '', status: 'ativo'
};

export default function CreateFilial() {
  const [companies, setCompanies] = useState([]);
  const [units, setUnits] = useState([]);
  const [empresaId, setEmpresaId] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [cepLoading, setCepLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const preselectedRef = useRef(false);

  const load = () => {
    api.get('/companies').then((res) => setCompanies(res.data));
    api.get('/units').then((res) => setUnits(res.data));
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (preselectedRef.current || companies.length === 0) return;
    preselectedRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const preselect = params.get('empresa_id');
    if (preselect && companies.some((c) => c.id === preselect)) {
      setEmpresaId(preselect);
      if (params.get('criar') === '1') setShowForm(true);
    }
  }, [companies]);

  const filiaisDaEmpresa = units.filter((u) => u.empresa_id === empresaId && u.tipo === 'Filial');

  const filteredFiliais = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return filiaisDaEmpresa;
    return filiaisDaEmpresa.filter((u) =>
      u.nome.toLowerCase().includes(q) ||
      (u.codigo || '').toLowerCase().includes(q) ||
      (u.endereco || '').toLowerCase().includes(q) ||
      (u.cidade || '').toLowerCase().includes(q)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units, empresaId, search]);

  const handleCepBlur = async () => {
    if (!form.cep) return;
    setCepLoading(true);
    try {
      const address = await fetchAddressByCep(form.cep);
      if (address) {
        setForm((f) => ({ ...f, endereco: address.endereco || f.endereco, bairro: address.bairro || f.bairro, cidade: address.cidade || f.cidade, estado: address.estado || f.estado }));
      }
    } catch {
      // silencioso — CEP autofill é conveniência, não bloqueia o cadastro
    } finally {
      setCepLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!empresaId) {
      setError('Selecione uma empresa antes de cadastrar a filial.');
      return;
    }
    if (!form.nome.trim()) {
      setError('Preencha o nome da filial.');
      return;
    }
    try {
      const payload = { ...form, tipo: 'Filial', empresa_id: empresaId };
      if (editingId) {
        await api.put(`/units/${editingId}`, payload);
        setSuccess('Filial atualizada com sucesso.');
      } else {
        await api.post('/units', payload);
        setSuccess('Filial cadastrada com sucesso.');
      }
      await load();
      setForm(emptyForm);
      setEditingId(null);
      setShowForm(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar filial');
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setSuccess('');
    setShowForm(true);
  };

  const handleEdit = (unit) => {
    setEditingId(unit.id);
    setError('');
    setSuccess('');
    setForm({
      nome: unit.nome || '',
      codigo: unit.codigo || '',
      cnpj: unit.cnpj || '',
      cep: unit.cep || '',
      endereco: unit.endereco || '',
      numero: unit.numero || '',
      complemento: unit.complemento || '',
      bairro: unit.bairro || '',
      cidade: unit.cidade || '',
      estado: unit.estado || '',
      responsavel: unit.responsavel || '',
      telefone: unit.telefone || '',
      email: unit.email || '',
      status: unit.status || 'ativo'
    });
    setShowForm(true);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Excluir esta filial?')) return;
    try {
      await api.delete(`/units/${id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao excluir filial');
    }
  };

  const handleImport = async (rows) => {
    let successCount = 0;
    const errors = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const empresa = companies.find((c) => normalizeDoc(c.cnpj) === normalizeDoc(r.empresa_cnpj));
      if (!empresa) {
        errors.push({ row: i + 2, message: `Empresa com CNPJ "${r.empresa_cnpj || ''}" não encontrada.` });
        continue;
      }
      if (!r.nome) {
        errors.push({ row: i + 2, message: 'Nome da filial é obrigatório.' });
        continue;
      }
      try {
        await api.post('/units', {
          empresa_id: empresa.id,
          tipo: 'Filial',
          nome: r.nome,
          codigo: r.codigo || '',
          cnpj: r.cnpj || '',
          cep: r.cep || '',
          endereco: r.endereco || '',
          numero: r.numero || '',
          complemento: r.complemento || '',
          bairro: r.bairro || '',
          cidade: r.cidade || '',
          estado: r.estado || '',
          responsavel: r.responsavel || '',
          telefone: r.telefone || '',
          email: r.email || '',
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
      <h2 className="page-title">Cadastrar Filial</h2>

      <div className="import-layout">
        <div className="panel-card import-layout__company">
          <h3>Empresa</h3>
          <label className="form-field">
            <SearchableSelect
              value={empresaId}
              onChange={(id) => { setEmpresaId(id); setEditingId(null); setForm(emptyForm); setShowForm(false); setSearch(''); }}
              placeholder="Pesquise uma empresa..."
              options={companies.map((c) => ({ value: c.id, label: c.razao_social, sublabel: c.cnpj }))}
            />
          </label>

          {empresaId && filiaisDaEmpresa.length > 0 && (
            <label className="form-field">Buscar filial existente
              <SearchableSelect
                value={editingId || ''}
                onChange={(id) => { const u = filiaisDaEmpresa.find((f) => f.id === id); if (u) handleEdit(u); }}
                placeholder="Digite o nome da filial para editar..."
                options={filiaisDaEmpresa.map((u) => ({
                  value: u.id,
                  label: u.nome,
                  sublabel: [u.endereco, u.numero, u.cidade && u.estado ? `${u.cidade}/${u.estado}` : u.cidade].filter(Boolean).join(', ')
                }))}
              />
            </label>
          )}
        </div>

        <ImportPanel
          title="Importação em Massa"
          hint="Importe várias filiais utilizando um arquivo CSV."
          templateHeaders={['empresa_cnpj', 'nome', 'codigo', 'cnpj', 'cep', 'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'estado', 'responsavel', 'telefone', 'email', 'status']}
          templateExample={['12.345.678/0001-90', 'Filial Zona Sul', 'FL-001', '12.345.678/0002-71', '04571-000', 'Av. Ibirapuera', '2000', 'Sala 10', 'Moema', 'São Paulo', 'SP', 'João Souza', '(11) 98888-0000', 'filial@exemplo.com', 'ativo']}
          onImport={handleImport}
        />
      </div>

      {!showForm && (
        <div className="row-actions" style={{ marginBottom: 20 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={openCreate}
            disabled={!empresaId}
            title={!empresaId ? 'Selecione uma empresa para cadastrar uma filial' : undefined}
          >
            + Criar Filial
          </button>
        </div>
      )}

      {empresaId && error && !showForm && <div className="alert alert-error" style={{ maxWidth: 720, marginBottom: 20 }}>{error}</div>}
      {empresaId && success && !showForm && <div className="alert alert-success" style={{ maxWidth: 720, marginBottom: 20 }}>{success}</div>}

      {empresaId && showForm && (
        <form onSubmit={handleSubmit} className="card-form">
          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}

          <label className="form-field">Nome da Filial<input className="form-input" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required /></label>
          <label className="form-field">Código da Filial<input className="form-input" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} /></label>
          <label className="form-field">CNPJ<input className="form-input" value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} /></label>
          <label className="form-field">CEP{cepLoading && ' (buscando...)'}<input className="form-input" value={form.cep} onChange={(e) => setForm({ ...form, cep: e.target.value })} onBlur={handleCepBlur} placeholder="00000-000" /></label>
          <label className="form-field">Endereço<input className="form-input" value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} /></label>
          <label className="form-field">Número<input className="form-input" value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} /></label>
          <label className="form-field">Complemento<input className="form-input" value={form.complemento} onChange={(e) => setForm({ ...form, complemento: e.target.value })} /></label>
          <label className="form-field">Bairro<input className="form-input" value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} /></label>
          <label className="form-field">Cidade<input className="form-input" value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} /></label>
          <label className="form-field">Estado<input className="form-input" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })} maxLength={2} placeholder="UF" /></label>
          <label className="form-field">Responsável<input className="form-input" value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} /></label>
          <label className="form-field">Telefone<input className="form-input" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></label>
          <label className="form-field">E-mail<input className="form-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label className="form-field">Status
            <select className="form-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="ativo">Ativa</option>
              <option value="inativo">Inativa</option>
            </select>
          </label>

          <div className="row-actions">
            <button type="submit" className="btn btn-primary">{editingId ? 'Salvar alterações' : 'Cadastrar filial'}</button>
            <button type="button" className="btn btn-outline" onClick={handleCancelEdit}>Cancelar</button>
          </div>
        </form>
      )}

      {empresaId && filiaisDaEmpresa.length > 0 && (
        <div className="list-controls" style={{ marginBottom: 12 }}>
          <input
            className="form-input search-input"
            placeholder="Pesquisar filial..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {empresaId && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Código</th>
              <th>Endereço</th>
              <th>Cidade/UF</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filiaisDaEmpresa.length === 0 ? (
              <tr><td colSpan={6} className="section-text">Nenhuma filial cadastrada para esta empresa ainda.</td></tr>
            ) : filteredFiliais.length === 0 ? (
              <tr><td colSpan={6} className="section-text">Nenhuma filial encontrada para "{search}".</td></tr>
            ) : (
              filteredFiliais.map((unit) => (
                <tr key={unit.id}>
                  <td>{unit.nome}</td>
                  <td>{unit.codigo || '—'}</td>
                  <td>{[unit.endereco, unit.numero].filter(Boolean).join(', ') || '—'}</td>
                  <td>{unit.cidade ? `${unit.cidade}/${unit.estado || ''}` : '—'}</td>
                  <td><span className={`badge badge-${unit.status}`}>{unit.status === 'ativo' ? 'Ativa' : 'Inativa'}</span></td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-outline btn-sm" onClick={() => handleEdit(unit)}>Editar</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(unit.id)}>Excluir</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
