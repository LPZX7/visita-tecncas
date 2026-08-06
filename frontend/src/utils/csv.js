function parseLine(line) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cur += ch; }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',' || ch === ';') {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

export function parseCsv(text) {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return [];
  const headers = parseLine(lines[0]).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = parseLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = (cells[i] || '').trim(); });
    return row;
  });
}

export function normalizeDoc(value) {
  return (value || '').replace(/\D/g, '');
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file, 'utf-8');
  });
}
