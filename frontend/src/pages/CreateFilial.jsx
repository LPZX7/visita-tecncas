import { useEffect, useState } from 'react';
import api from '../api';
import { fetchAddressByCep } from '../utils/cep';

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

  const load = () => {
    api.get('/companies').then((res) => setCompanies(res.data));
    api.get('/units').then((res) => setUnits(res.data));
  };

  useEffect(() => {
    load();
  }, []);

  const filiaisDaEmpresa = units.filter((u) => u.empresa_id === empresaId && u.tipo === 'Filial');

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
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar filial');
    }
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
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
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

  return (
    <div>
      <h2 className="page-title">Cadastrar Filial</h2>

      <form onSubmit={handleSubmit} className="card-form">
        <label className="form-field">Empresa
          <select className="form-select" value={empresaId} onChange={(e) => { setEmpresaId(e.target.value); setEditingId(null); setForm(emptyForm); }} required>
            <option value="">Selecione a empresa</option>
            {companies.map((c) => (<option key={c.id} value={c.id}>{c.razao_social}</option>))}
          </select>
        </label>

        {empresaId && (
          <>
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
              {editingId && <button type="button" className="btn btn-outline" onClick={handleCancelEdit}>Cancelar</button>}
            </div>
          </>
        )}
      </form>

      {empresaId && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Código</th>
              <th>Cidade/UF</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filiaisDaEmpresa.length === 0 ? (
              <tr><td colSpan={5} className="section-text">Nenhuma filial cadastrada para esta empresa ainda.</td></tr>
            ) : (
              filiaisDaEmpresa.map((unit) => (
                <tr key={unit.id}>
                  <td>{unit.nome}</td>
                  <td>{unit.codigo || '—'}</td>
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
