import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import SearchableSelect from '../components/SearchableSelect';
import { getUser } from '../utils/auth';

const emptyForm = { empresa_id: '', unidade_id: '', modelo: '', numero_serie: '', local_instalacao: '', data_instalacao: '', garantia_ate: '' };

function equipmentType(model = '') {
  const text = model.toLowerCase();
  if (text.includes('catraca')) return 'Catraca';
  if (text.includes('totem')) return 'Totem';
  if (text.includes('maquin')) return 'Maquininha';
  if (text.includes('caixa') || text.includes('pallas')) return 'Caixa / PDV';
  if (text.includes('meep')) return 'Meep';
  return 'Equipamento';
}

export default function Equipments() {
  const canManage = getUser()?.role === 'gestor';
  const [equipments, setEquipments] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [units, setUnits] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [expandedCompanies, setExpandedCompanies] = useState({});
  const [expandedUnits, setExpandedUnits] = useState({});

  const load = async () => {
    try {
      const [equipmentRes, companyRes, unitRes] = await Promise.all([api.get('/equipments'), api.get('/companies'), api.get('/units')]);
      setEquipments(equipmentRes.data); setCompanies(companyRes.data); setUnits(unitRes.data);
    } catch (err) { setError(err.response?.data?.error || 'Não foi possível carregar os equipamentos.'); }
  };
  useEffect(() => { load(); }, []);

  const unitsForSelectedCompany = units.filter((unit) => unit.empresa_id === form.empresa_id && unit.status !== 'inativo');
  const hierarchy = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies.map((company) => {
      const companyEquipments = equipments.filter((equipment) => equipment.empresa_id === company.id);
      const groups = [
        ...units.filter((unit) => unit.empresa_id === company.id).map((unit) => ({
          id: unit.id, name: unit.nome, type: unit.tipo,
          address: [unit.endereco, unit.cidade, unit.estado].filter(Boolean).join(' · '),
          equipments: companyEquipments.filter((equipment) => equipment.unidade_id === unit.id)
        })),
        { id: `general-${company.id}`, name: 'Unidade não informada', type: 'Geral', address: 'Equipamentos compartilhados ou ainda sem filial definida', equipments: companyEquipments.filter((equipment) => !equipment.unidade_id) }
      ].filter((group) => group.equipments.length > 0);
      const content = `${company.razao_social} ${company.nome_fantasia || ''} ${groups.flatMap((group) => group.equipments.map((equipment) => `${equipment.modelo} ${equipment.numero_serie} ${equipment.local_instalacao || ''}`)).join(' ')}`.toLowerCase();
      return { ...company, groups, equipmentCount: companyEquipments.length, matches: !q || content.includes(q) };
    }).filter((company) => company.equipmentCount > 0 && company.matches).sort((a, b) => a.razao_social.localeCompare(b.razao_social, 'pt-BR'));
  }, [companies, equipments, units, search]);

  const openCreate = (empresa_id = '', unidade_id = '') => { setEditingId(null); setForm({ ...emptyForm, empresa_id, unidade_id }); setError(''); setShowForm(true); };
  const handleEdit = (equipment) => { setEditingId(equipment.id); setForm({ empresa_id: equipment.empresa_id || '', unidade_id: equipment.unidade_id || '', modelo: equipment.modelo || '', numero_serie: equipment.numero_serie || '', local_instalacao: equipment.local_instalacao || '', data_instalacao: equipment.data_instalacao || '', garantia_ate: equipment.garantia_ate || '' }); setError(''); setShowForm(true); };
  const handleSubmit = async (event) => {
    event.preventDefault(); setError('');
    try { if (editingId) await api.put(`/equipments/${editingId}`, form); else await api.post('/equipments', form); await load(); setShowForm(false); setEditingId(null); setForm(emptyForm); }
    catch (err) { setError(err.response?.data?.error || 'Erro ao salvar equipamento.'); }
  };
  const handleDelete = async (id) => {
    if (!window.confirm('Excluir este equipamento?')) return;
    try { await api.delete(`/equipments/${id}`); await load(); } catch (err) { setError(err.response?.data?.error || 'Erro ao excluir equipamento.'); }
  };

  return <div className="equipment-page">
    <div className="page-header equipment-page__header"><div><span className="page-eyebrow">PARQUE INSTALADO</span><h2 className="page-title">Equipamentos por empresa</h2><p className="section-text">Abra uma empresa para visualizar suas filiais e os equipamentos usados em cada local.</p></div>{canManage && !showForm && <button type="button" className="btn btn-primary" onClick={() => openCreate()}>+ Novo equipamento</button>}</div>
    {error && !showForm && <div className="alert alert-error" role="alert">{error}</div>}

    {showForm && <form onSubmit={handleSubmit} className="card-form equipment-form">
      <div><span className="page-eyebrow">CADASTRO</span><h3>{editingId ? 'Editar equipamento' : 'Novo equipamento'}</h3></div>
      {error && <div className="alert alert-error">{error}</div>}
      <label className="form-field">Empresa<SearchableSelect value={form.empresa_id} onChange={(id) => setForm({ ...form, empresa_id: id, unidade_id: '' })} placeholder="Buscar empresa..." options={companies.map((company) => ({ value: company.id, label: company.razao_social, sublabel: company.cnpj }))} /></label>
      <label className="form-field">Filial / sede<SearchableSelect value={form.unidade_id} onChange={(id) => setForm({ ...form, unidade_id: id })} disabled={!form.empresa_id} placeholder={form.empresa_id ? 'Buscar filial ou sede...' : 'Selecione a empresa primeiro'} emptyMessage="Nenhuma filial cadastrada para essa empresa." options={unitsForSelectedCompany.map((unit) => ({ value: unit.id, label: `${unit.tipo} — ${unit.nome}`, sublabel: [unit.endereco, unit.cidade].filter(Boolean).join(', ') }))} /></label>
      <label className="form-field">Equipamento / modelo<input className="form-input" value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} placeholder="Ex.: Catraca Revolution, Totem Meep, Caixa Pallas" required /></label>
      <label className="form-field">Número de série<input className="form-input" value={form.numero_serie} onChange={(e) => setForm({ ...form, numero_serie: e.target.value })} required /></label>
      <label className="form-field">Local dentro da unidade<input className="form-input" value={form.local_instalacao} onChange={(e) => setForm({ ...form, local_instalacao: e.target.value })} placeholder="Ex.: Refeitório, recepção, caixa 02" /></label>
      <div className="form-grid-2"><label className="form-field">Data de instalação<input className="form-input" type="date" value={form.data_instalacao} onChange={(e) => setForm({ ...form, data_instalacao: e.target.value })} /></label><label className="form-field">Garantia até<input className="form-input" type="date" value={form.garantia_ate} onChange={(e) => setForm({ ...form, garantia_ate: e.target.value })} /></label></div>
      <div className="row-actions"><button type="submit" className="btn btn-primary">{editingId ? 'Salvar alterações' : 'Cadastrar equipamento'}</button><button type="button" className="btn btn-outline" onClick={() => { setShowForm(false); setError(''); }}>Cancelar</button></div>
    </form>}

    {!showForm && <><div className="equipment-search panel-card"><input className="form-input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar empresa, modelo, série ou local..." /><span>{hierarchy.length} empresa(s) · {equipments.length} equipamento(s)</span></div>
      <div className="equipment-company-list">{hierarchy.map((company) => {
        const isOpen = Boolean(expandedCompanies[company.id]);
        return <section key={company.id} className={`equipment-company ${isOpen ? 'is-open' : ''}`}>
          <button type="button" className="equipment-company__toggle" onClick={() => setExpandedCompanies((current) => ({ ...current, [company.id]: !current[company.id] }))} aria-expanded={isOpen}>
            <span className="equipment-company__avatar">{(company.nome_fantasia || company.razao_social).slice(0, 2).toUpperCase()}</span>
            <span className="equipment-company__name"><strong>{company.nome_fantasia || company.razao_social}</strong><small>{company.razao_social !== company.nome_fantasia ? company.razao_social : company.cnpj}</small></span>
            <span className="equipment-company__count"><strong>{company.equipmentCount}</strong><small>equipamento(s)</small></span><span className="equipment-chevron">⌄</span>
          </button>
          {isOpen && <div className="equipment-company__body">{company.groups.map((group) => {
            const groupOpen = expandedUnits[group.id] !== false;
            return <div key={group.id} className="equipment-unit"><button type="button" className="equipment-unit__toggle" onClick={() => setExpandedUnits((current) => ({ ...current, [group.id]: current[group.id] === false }))} aria-expanded={groupOpen}><span><strong>{group.type} · {group.name}</strong><small>{group.address}</small></span><span>{group.equipments.length} item(ns) {groupOpen ? '−' : '+'}</span></button>
              {groupOpen && <div className="equipment-cards">{group.equipments.map((equipment) => <article key={equipment.id} className="equipment-card"><div className="equipment-card__top"><span className="equipment-type">{equipmentType(equipment.modelo)}</span><span className="equipment-serial">Série {equipment.numero_serie}</span></div><h4>{equipment.modelo}</h4><p>{equipment.local_instalacao || 'Local interno não informado'}</p><div className="equipment-card__meta"><span>Instalação: {equipment.data_instalacao || '—'}</span><span>Garantia: {equipment.garantia_ate || '—'}</span></div>{canManage && <div className="row-actions"><button className="btn btn-outline btn-sm" onClick={() => handleEdit(equipment)}>Editar</button><button className="btn btn-danger btn-sm" onClick={() => handleDelete(equipment.id)}>Excluir</button></div>}</article>)}{canManage && !group.id.startsWith('general-') && <button type="button" className="equipment-add-card" onClick={() => openCreate(company.id, group.id)}>+ Adicionar equipamento nesta unidade</button>}</div>}
            </div>;
          })}</div>}
        </section>;
      })}{hierarchy.length === 0 && <div className="panel-card empty-state"><h4>Nenhuma empresa encontrada</h4><p>Cadastre um equipamento ou tente outro termo de busca.</p></div>}</div>
    </>}
  </div>;
}
