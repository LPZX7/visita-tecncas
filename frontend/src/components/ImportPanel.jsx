import { useRef, useState } from 'react';
import { parseCsv, readFileAsText } from '../utils/csv';

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isCsvFile(file) {
  return /\.csv$/i.test(file.name) || file.type === 'text/csv' || file.type === 'application/vnd.ms-excel';
}

const UploadIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 15V4M12 4l-4.5 4.5M12 4l4.5 4.5" />
    <path d="M4 16v2.5A2.5 2.5 0 006.5 21h11a2.5 2.5 0 002.5-2.5V16" />
  </svg>
);

const FileIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
    <path d="M7 2.5h7l4 4v15H7z" />
    <path d="M10 11h6M10 15h6M10 7h2" strokeLinecap="round" />
  </svg>
);

export default function ImportPanel({ title, hint, templateHeaders, templateExample, onImport }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const downloadTemplate = () => {
    const csv = [templateHeaders.join(','), templateExample.join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `modelo-${title.toLowerCase().replace(/\s+/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const acceptFile = (f) => {
    setResult(null);
    if (!f) return;
    if (!isCsvFile(f)) {
      setFile(null);
      setFileError('Formato inválido. Selecione um arquivo .csv.');
      return;
    }
    setFileError('');
    setFile(f);
  };

  const handleInputChange = (e) => {
    acceptFile(e.target.files?.[0] || null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    acceptFile(e.dataTransfer.files?.[0] || null);
  };

  const handleRemove = () => {
    setFile(null);
    setFileError('');
    setResult(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleImport = async () => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const text = await readFileAsText(file);
      const rows = parseCsv(text);
      if (rows.length === 0) {
        setResult({ success: 0, errors: [{ row: 0, message: 'Arquivo vazio ou sem linhas de dados.' }] });
        return;
      }
      const outcome = await onImport(rows);
      setResult(outcome);
      if (outcome.errors.length === 0) {
        setFile(null);
        if (inputRef.current) inputRef.current.value = '';
      }
    } catch (err) {
      setResult({ success: 0, errors: [{ row: 0, message: 'Não foi possível ler o arquivo. Confira se é um CSV válido.' }] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel-card import-card">
      <div className="import-card__header">
        <span className="import-card__icon"><UploadIcon /></span>
        <div>
          <h4>{title}</h4>
          {hint && <p className="import-card__hint">{hint}</p>}
        </div>
      </div>

      <div
        className={`import-dropzone ${dragActive ? 'is-dragging' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
      >
        <UploadIcon />
        <p><strong>Arraste o CSV aqui</strong> ou clique para selecionar</p>
        <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={handleInputChange} hidden />
      </div>

      {fileError && <div className="alert alert-error" style={{ marginTop: 10 }}>{fileError}</div>}

      {file && (
        <div className="import-file-chip">
          <FileIcon />
          <div className="import-file-chip__info">
            <strong>{file.name}</strong>
            <span>{formatFileSize(file.size)}</span>
          </div>
          <button type="button" className="import-file-chip__remove" onClick={handleRemove} aria-label="Remover arquivo">×</button>
        </div>
      )}

      <div className="import-card__footer">
        <button type="button" className="import-card__template-link" onClick={downloadTemplate}>Baixar modelo CSV</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={handleImport} disabled={!file || busy}>
          {busy ? 'Importando...' : 'Importar'}
        </button>
      </div>

      {result && (
        <div className={`alert ${result.errors.length > 0 ? 'alert-error' : 'alert-success'}`} style={{ marginTop: 12 }}>
          <div>{result.success} registro{result.success === 1 ? '' : 's'} importado{result.success === 1 ? '' : 's'} com sucesso.</div>
          {result.errors.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {result.errors.slice(0, 10).map((e, i) => (
                <li key={i}>Linha {e.row}: {e.message}</li>
              ))}
              {result.errors.length > 10 && <li>+ {result.errors.length - 10} outro(s) erro(s)</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
