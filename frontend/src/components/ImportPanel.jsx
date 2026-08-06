import { useRef, useState } from 'react';
import { parseCsv, readFileAsText } from '../utils/csv';

export default function ImportPanel({ title, hint, templateHeaders, templateExample, onImport }) {
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState('');
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

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    setFileName(file ? file.name : '');
    setResult(null);
  };

  const handleImport = async () => {
    const file = fileRef.current?.files?.[0];
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
    } catch (err) {
      setResult({ success: 0, errors: [{ row: 0, message: 'Não foi possível ler o arquivo. Confira se é um CSV válido.' }] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="import-panel">
      <h4>{title}</h4>
      {hint && <p className="section-text" style={{ marginTop: 4 }}>{hint}</p>}
      <div className="import-panel__row">
        <button type="button" className="btn btn-outline btn-sm" onClick={downloadTemplate}>Baixar modelo CSV</button>
        <label className="import-panel__file">
          <input type="file" accept=".csv,text/csv" ref={fileRef} onChange={handleFile} />
          <span>{fileName || 'Escolher arquivo CSV...'}</span>
        </label>
        <button type="button" className="btn btn-primary btn-sm" onClick={handleImport} disabled={!fileName || busy}>
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
