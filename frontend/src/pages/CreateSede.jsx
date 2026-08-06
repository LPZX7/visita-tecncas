import { useEffect, useState } from 'react';
import api from '../api';
import { fetchAddressByCep } from '../utils/cep';
import { normalizeDoc } from '../utils/csv';
import ImportPanel from '../components/ImportPanel';

const emptyForm = { nome: '', cep: '', endereco: '', numero: '', cidade: '', estado: '', responsavel: '', telefone: '', email: '' };

export default function CreateSede() {
  const [companies, setCompanies] = useState([]);
  const [units, setUnits] = useState([]);
  const [empresaId, setEmpresaId] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [cepLoading, setCepLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    api.get('/companies').then((res) => setCompanies(res.data));
    api.get('/units').then((res) => setUnits(res.data));
  }, []);

  const sedeExistente = units.find((u) => u.empresa_id === empresaId && u.tipo === 'Sede');

  useEffect(() => {
    setError('');
    setSuccess('');
    if (sedeExistente) {
      setEditingId(sedeExistente.id);
      setForm({
        nome: sedeExistente.nome || '',
        cep: sedeExistente.cep || '',
        endereco: sedeExistente.endereco || '',
        numero: sedeExistente.numero || '',
        cidade: sedeExistente.cidade || '',
        estado: sedeExistente.estado || '',
        responsavel: sedeExistente.responsavel || '',
        telefone: sedeExistente.telefone || '',
        email: sedeExistente.email || ''
      });
    } else {
      setEditingId(null);
      setForm(emptyForm);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const handleCepBlur = async () => {
    if (!form.cep) return;
    setCepLoading(true);
    try {
      const address = await fetchAddressByCep(form.cep);
      if (address) {
        setForm((f) => ({ ...f, endereco: address.endereco || f.endereco, cidade: address.cidade || f.cidade, estado: address.estado || f.estado }));
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
      setError('Selecione uma empresa antes de cadastrar a sede.');
      return;
    }
    if (!form.nome.trim()) {
      setError('Preencha o nome da sede.');
      return;
    }
    try {
      const payload = { ...form, tipo: 'Sede', empresa_id: empresaId };
      if (editingId) {
        await api.put(`/units/${editingId}`, payload);
        setSuccess('Sede atualizada com sucesso.');
      } else {
        await api.post('/units', payload);
        setSuccess('Sede cadastrada com sucesso.');
      }
      const res = await api.get('/units');
      setUnits(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar sede');
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
        errors.push({ row: i + 2, message: 'Nome da sede é obrigatório.' });
        continue;
      }
      try {
        await api.post('/units', {
          empresa_id: empresa.id,
          tipo: 'Sede',
          nome: r.nome,
          cep: r.cep || '',
          endereco: r.endereco || '',
          numero: r.numero || '',
          cidade: r.cidade || '',
          estado: r.estado || '',
          responsavel: r.responsavel || '',
          telefone: r.telefone || '',
          email: r.email || ''
        });
        successCount++;
      } catch (err) {
        errors.push({ row: i + 2, message: err.response?.data?.error || 'Erro ao importar' });
      }
    }
    const res = await api.get('/units');
    setUnits(res.data);
    return { success: successCount, errors };
  };

  return (
    <div>
      <h2 className="page-title">Cadastrar Sede</h2>
      <p className="section-text">Cada empresa pode ter apenas uma sede principal.</p>

      <ImportPanel
        title="Importar sedes em massa"
        hint="Envie um CSV com as colunas: empresa_cnpj (deve ser de uma empresa já cadastrada), nome, cep, endereco, numero, cidade, estado, responsavel, telefone, email."
        templateHeaders={['empresa_cnpj', 'nome', 'cep', 'endereco', 'numero', 'cidade', 'estado', 'responsavel', 'telefone', 'email']}
        templateExample={['12.345.678/0001-90', 'Sede Principal', '01310-100', 'Avenida Paulista', '1000', 'São Paulo', 'SP', 'Maria Silva', '(11) 99999-0000', 'sede@exemplo.com']}
        onImport={handleImport}
      />

      <form onSubmit={handleSubmit} className="card-form">
        <label className="form-field">Empresa
          <select className="form-select" value={empresaId} onChange={(e) => setEmpresaId(e.target.value)} required>
            <option value="">Selecione a empresa</option>
            {companies.map((c) => (<option key={c.id} value={c.id}>{c.razao_social}</option>))}
          </select>
        </label>

        {empresaId && (
          <>
            {sedeExistente && (
              <div className="alert alert-info">Esta empresa já possui uma sede cadastrada. Os dados abaixo foram carregados para edição.</div>
            )}
            {error && <div className="alert alert-error">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            <label className="form-field">Nome da Sede<input className="form-input" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required /></label>
            <label className="form-field">CEP{cepLoading && ' (buscando...)'}<input className="form-input" value={form.cep} onChange={(e) => setForm({ ...form, cep: e.target.value })} onBlur={handleCepBlur} placeholder="00000-000" /></label>
            <label className="form-field">Endereço<input className="form-input" value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} /></label>
            <label className="form-field">Número<input className="form-input" value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} /></label>
            <label className="form-field">Cidade<input className="form-input" value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} /></label>
            <label className="form-field">Estado<input className="form-input" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })} maxLength={2} placeholder="UF" /></label>
            <label className="form-field">Responsável<input className="form-input" value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} /></label>
            <label className="form-field">Telefone<input className="form-input" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></label>
            <label className="form-field">E-mail<input className="form-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>

            <div className="row-actions">
              <button type="submit" className="btn btn-primary">{editingId ? 'Salvar alterações' : 'Cadastrar sede'}</button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
