import { useEffect, useRef, useState } from 'react';
import api from '../api';
import { fetchAddressByCep } from '../utils/cep';
import { normalizeDoc } from '../utils/csv';
import { getUser } from '../utils/auth';
import ImportPanel from '../components/ImportPanel';
import SearchableSelect from '../components/SearchableSelect';

const emptyForm = { nome: '', cep: '', endereco: '', numero: '', cidade: '', estado: '', responsavel: '', telefone: '', email: '' };

export default function CreateSede() {
  const user = getUser();
  const isGestor = user?.role === 'gestor';
  const [companies, setCompanies] = useState([]);
  const [units, setUnits] = useState([]);
  const [empresaId, setEmpresaId] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [cepLoading, setCepLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const preselectedRef = useRef(false);
  const autoOpenNextRef = useRef(false);

  useEffect(() => {
    Promise.all([api.get('/companies'), api.get('/units')]).then(([companiesRes, unitsRes]) => {
      setCompanies(companiesRes.data);
      setUnits(unitsRes.data);
      setDataLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (preselectedRef.current || !dataLoaded) return;
    preselectedRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const preselect = params.get('empresa_id');
    if (preselect && companies.some((c) => c.id === preselect)) {
      if (params.get('criar') === '1') autoOpenNextRef.current = true;
      setEmpresaId(preselect);
    }
  }, [dataLoaded, companies]);

  const sedeExistente = units.find((u) => u.empresa_id === empresaId && u.tipo === 'Sede');

  useEffect(() => {
    setError('');
    setSuccess('');
    if (autoOpenNextRef.current) {
      setShowForm(true);
      autoOpenNextRef.current = false;
    } else {
      setShowForm(false);
    }
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

  const openForm = () => {
    setError('');
    setSuccess('');
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
  };

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
      setShowForm(false);
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

      <div className="panel-card" style={{ maxWidth: 720, marginBottom: 20 }}>
        <h3>Empresa</h3>
        <label className="form-field">
          <SearchableSelect
            value={empresaId}
            onChange={setEmpresaId}
            placeholder="Pesquise uma empresa..."
            options={companies.map((c) => ({ value: c.id, label: c.razao_social, sublabel: c.cnpj }))}
          />
        </label>
      </div>

      {empresaId && !showForm && (
        sedeExistente ? (
          <div className="panel-card" style={{ maxWidth: 720, marginBottom: 20 }}>
            <div className="row-actions" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <h3 style={{ margin: 0 }}>{sedeExistente.nome}</h3>
              <button type="button" className="btn btn-outline btn-sm" onClick={openForm}>Editar Sede</button>
            </div>
            <p className="section-text" style={{ margin: '8px 0 0' }}>
              {[sedeExistente.endereco, sedeExistente.numero].filter(Boolean).join(', ') || 'Endereço não informado'}
              {sedeExistente.cidade ? ` — ${sedeExistente.cidade}/${sedeExistente.estado || ''}` : ''}
            </p>
            {(sedeExistente.responsavel || sedeExistente.telefone || sedeExistente.email) && (
              <p className="section-text" style={{ margin: '4px 0 0' }}>
                {[sedeExistente.responsavel, sedeExistente.telefone, sedeExistente.email].filter(Boolean).join(' · ')}
              </p>
            )}
            {isGestor && sedeExistente.valor_deslocamento_padrao != null && (
              <p className="section-text" style={{ margin: '4px 0 0' }}>
                Deslocamento: R$ {Number(sedeExistente.valor_deslocamento_padrao).toFixed(2)}
              </p>
            )}
          </div>
        ) : (
          <div className="row-actions" style={{ marginBottom: 20 }}>
            <button type="button" className="btn btn-primary" onClick={openForm}>+ Criar Sede</button>
          </div>
        )
      )}

      {empresaId && error && !showForm && <div className="alert alert-error" style={{ maxWidth: 720, marginBottom: 20 }}>{error}</div>}
      {empresaId && success && !showForm && <div className="alert alert-success" style={{ maxWidth: 720, marginBottom: 20 }}>{success}</div>}

      {empresaId && showForm && (
        <form onSubmit={handleSubmit} className="card-form">
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
            <button type="button" className="btn btn-outline" onClick={handleCancel}>Cancelar</button>
          </div>
        </form>
      )}
    </div>
  );
}
