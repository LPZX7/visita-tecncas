import { useEffect, useRef, useState } from 'react';

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </svg>
);

export default function SearchableSelect({ value, onChange, options, placeholder, disabled, emptyMessage }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const boxRef = useRef(null);

  const selected = options.find((o) => o.value === value) || null;

  useEffect(() => {
    if (!open) setQuery(selected ? selected.label : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, open]);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) {
        setOpen(false);
        setQuery(selected ? selected.label : '');
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => o.label.toLowerCase().includes(q) || (o.sublabel || '').toLowerCase().includes(q))
    : options;
  const visible = filtered.slice(0, 100);

  useEffect(() => {
    setActiveIndex(visible.length > 0 ? 0 : -1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  const handleSelect = (opt) => {
    onChange(opt.value);
    setQuery(opt.label);
    setOpen(false);
  };

  const handleClear = () => {
    onChange('');
    setQuery('');
    setOpen(true);
  };

  const handleKeyDown = (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, visible.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (visible[activeIndex]) handleSelect(visible[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery(selected ? selected.label : '');
    }
  };

  return (
    <div className="searchable-select" ref={boxRef}>
      <div className="searchable-select__input-wrap">
        <span className="searchable-select__search-icon"><SearchIcon /></span>
        <input
          className="form-input"
          value={open ? query : (selected ? selected.label : '')}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { setOpen(true); setQuery(''); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || 'Buscar...'}
          disabled={disabled}
          autoComplete="off"
        />
        {selected && !open && (
          <button type="button" className="searchable-select__clear" onClick={handleClear} aria-label="Limpar seleção">×</button>
        )}
      </div>
      {open && (
        <ul className="searchable-select__list">
          {visible.length === 0 ? (
            <li className="searchable-select__empty">{emptyMessage || 'Nenhum resultado encontrado.'}</li>
          ) : (
            visible.map((opt, i) => (
              <li
                key={opt.value}
                className={`searchable-select__option ${opt.value === value ? 'is-selected' : ''} ${i === activeIndex ? 'is-active' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(opt); }}
                onMouseEnter={() => setActiveIndex(i)}
              >
                <span className="searchable-select__label">{opt.label}</span>
                {opt.sublabel && <span className="searchable-select__sublabel">{opt.sublabel}</span>}
              </li>
            ))
          )}
          {filtered.length > visible.length && (
            <li className="searchable-select__empty">+ {filtered.length - visible.length} resultado(s) — refine a busca</li>
          )}
        </ul>
      )}
    </div>
  );
}
