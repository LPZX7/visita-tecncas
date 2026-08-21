const SECTION_TITLES = new Set([
  'Problema identificado',
  'Serviço realizado',
  'Peça utilizada',
  'Peças utilizadas',
  'Item ou custo adicional',
  'Observações finais',
  'Status',
  'Registro'
]);

function parseSections(value) {
  const blocks = String(value || '').split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const sections = [];
  let current = null;

  for (const block of blocks) {
    if (SECTION_TITLES.has(block)) {
      current = { title: block, content: [] };
      sections.push(current);
    } else if (current) {
      current.content.push(block);
    } else {
      sections.push({ title: '', content: [block] });
    }
  }

  return sections;
}

export default function TechnicalRecord({ value }) {
  const sections = parseSections(value);
  if (!sections.length) return null;

  return (
    <div className="technical-record">
      {sections.map((item, index) => (
        <section
          className={`technical-record__section ${item.title === 'Status' ? 'technical-record__section--status' : ''}`}
          key={`${item.title || 'texto'}-${index}`}
        >
          {item.title && <strong>{item.title}</strong>}
          <p>{item.content.join('\n\n')}</p>
        </section>
      ))}
    </div>
  );
}
