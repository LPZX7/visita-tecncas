import { useEffect, useId, useRef, useState } from 'react';

function money(value) {
  return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
}

function PartIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM4 7.5l8 4.5 8-4.5M12 12v9" /></svg>;
}

export default function PartCombobox({ value, onChange, parts, disabled = false }) {
  const id = useId();
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = parts.find((part) => part.id === value) || null;
  const normalizedQuery = query.toLowerCase().trim();
  const filtered = parts.filter((part) => `${part.nome || ''} ${part.codigo || ''} ${part.categoria || ''} ${part.fabricante || ''} ${part.modelo || ''}`.toLowerCase().includes(normalizedQuery));

  useEffect(() => {
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOutside);
    return () => document.removeEventListener('mousedown', closeOutside);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  const choose = (part) => {
    onChange(part.id);
    setOpen(false);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); return; }
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, filtered.length - 1)); return; }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)); return; }
    if (event.key === 'Enter' && filtered[activeIndex]) { event.preventDefault(); choose(filtered[activeIndex]); }
  };

  return <div className={`part-combobox ${open ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''}`} ref={rootRef}>
    <button type="button" className="part-combobox__trigger" aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-listbox`} disabled={disabled} onClick={() => setOpen((current) => !current)} onKeyDown={(event) => {
      if (['Enter', ' ', 'ArrowDown'].includes(event.key)) { event.preventDefault(); setOpen(true); }
      if (event.key === 'Escape') setOpen(false);
    }}>
      <span className="part-combobox__icon"><PartIcon /></span>
      <span className={selected ? 'part-combobox__value' : 'part-combobox__placeholder'}>{selected?.nome || 'Selecione uma peça'}</span>
      <svg className="part-combobox__chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 7.5l5 5 5-5" /></svg>
    </button>
    {open && <div className="part-combobox__dropdown">
      <div className="part-combobox__search-wrap">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
        <input ref={searchRef} value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={handleKeyDown} placeholder="Pesquisar peça..." aria-label="Pesquisar peça" role="combobox" aria-expanded="true" aria-controls={`${id}-listbox`} aria-activedescendant={filtered[activeIndex] ? `${id}-option-${filtered[activeIndex].id}` : undefined} />
      </div>
      <div className="part-combobox__list" id={`${id}-listbox`} role="listbox" aria-label="Peças disponíveis">
        {filtered.length === 0 ? <div className="part-combobox__empty"><PartIcon /><strong>Nenhuma peça encontrada</strong><span>Tente buscar por outro nome, código ou categoria.</span></div> : filtered.map((part, index) => <button type="button" key={part.id} id={`${id}-option-${part.id}`} role="option" aria-selected={part.id === value} className={`part-combobox__option ${index === activeIndex ? 'is-active' : ''} ${part.id === value ? 'is-selected' : ''}`} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(part)}>
          <span className="part-combobox__option-icon"><PartIcon /></span>
          <span className="part-combobox__option-copy"><strong>{part.nome}</strong><small>{[part.categoria, part.codigo].filter(Boolean).join(' • ')}</small></span>
          <span className="part-combobox__price">{money(part.preco_unitario)}</span>
        </button>)}
      </div>
    </div>}
  </div>;
}
