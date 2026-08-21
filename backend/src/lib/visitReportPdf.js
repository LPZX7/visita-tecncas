const PDFDocument = require('pdfkit');
const { drawHeader } = require('./pdfHeader');
const { buildCompletionSummary } = require('./visitCompletion');
const { formatDateTime } = require('./technicalWriting');

function generateVisitReportPdf({ request, company, equipment, technician, approvedParts = [] }) {
  const doc = new PDFDocument({ size: 'A4', margin: 56 });

  drawHeader(doc, 'Relatório de Visita Técnica');

  doc.font('Helvetica-Bold').fontSize(13).fillColor('#0F2747').text(`Chamado #${request.numero} — ${request.descricao}`);
  doc.moveDown(1.2);

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#0F2747').text('CLIENTE');
  doc.font('Helvetica').fontSize(10).fillColor('#1B1E22').text(company?.razao_social || '—');
  doc.moveDown(0.8);

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#0F2747').text('EQUIPAMENTO');
  doc.font('Helvetica').fontSize(10).fillColor('#1B1E22')
    .text(equipment ? `${equipment.modelo} — Série ${equipment.numero_serie}` : '—');
  doc.moveDown(0.8);

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#0F2747').text('TÉCNICO RESPONSÁVEL');
  doc.font('Helvetica').fontSize(10).fillColor('#1B1E22').text(technician?.nome || '—');
  doc.moveDown(1);

  const rows = [
    ['Check-in', formatDateTime(request.hora_checkin) || '—'],
    ['Check-out', formatDateTime(request.hora_checkout) || '—']
  ];
  doc.font('Helvetica').fontSize(10).fillColor('#1B1E22');
  rows.forEach(([label, value]) => {
    const y = doc.y;
    doc.text(label, 56, y);
    doc.text(value, 400, y, { width: 139, align: 'right' });
  });
  doc.x = 56;
  doc.moveDown(1);

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#0F2747').text('REGISTRO TÉCNICO', 56, doc.y);
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(10).fillColor('#1B1E22')
    .text(buildCompletionSummary({ request, approvedParts, technician: technician?.nome, includeStatusIcon: false }) || 'Nenhum relatório registrado.', 56, doc.y, { width: 483 });

  if (request.avaliacao) {
    doc.moveDown(1.2);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#0F2747').text('AVALIAÇÃO DO CLIENTE', 56, doc.y);
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).fillColor('#1B1E22')
      .text(`${request.avaliacao} de 5 estrelas`, 56, doc.y);
    if (request.avaliacao_comentario) {
      doc.moveDown(0.3);
      doc.text(request.avaliacao_comentario, 56, doc.y, { width: 483 });
    }
  }

  return doc;
}

module.exports = { generateVisitReportPdf };
