const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { drawHeader } = require('./pdfHeader');
const { buildCompletionSummary } = require('./visitCompletion');
const { formatDateTime } = require('./technicalWriting');

async function generateTermoConclusaoPdf({ request, company, unit, technician, contract, aceite, validationUrl, approvedParts = [] }) {
  const qrDataUrl = await QRCode.toDataURL(validationUrl, { margin: 1, width: 160 });

  const doc = new PDFDocument({ size: 'A4', margin: 56 });

  drawHeader(doc, 'Termo de Conclusão e Aceite de Visita Técnica');

  doc.font('Helvetica-Bold').fontSize(13).fillColor('#0F2747').text(`Visita referente ao Chamado #${request.numero}`);
  if (contract) {
    doc.font('Helvetica').fontSize(9).fillColor('#64748b').text(`Contrato: ${contract.numero}`);
  }
  doc.moveDown(1);

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#0F2747').text('CLIENTE');
  doc.font('Helvetica').fontSize(10).fillColor('#1B1E22').text(company?.razao_social || '—');
  if (unit) doc.text(`${unit.tipo}: ${unit.nome}`);
  doc.moveDown(0.8);

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#0F2747').text('TÉCNICO RESPONSÁVEL');
  doc.font('Helvetica').fontSize(10).fillColor('#1B1E22').text(technician?.nome || '—');
  doc.moveDown(0.8);

  const rows = [
    ['Problema informado', request.descricao],
    ['Check-in', formatDateTime(request.hora_checkin) || '—'],
    ['Check-out', formatDateTime(request.hora_checkout) || '—']
  ];
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#0F2747').text('DADOS DO ATENDIMENTO');
  doc.font('Helvetica').fontSize(10).fillColor('#1B1E22');
  rows.forEach(([label, value]) => {
    doc.text(`${label}: ${value}`, 56, doc.y, { width: 483 });
  });
  doc.moveDown(0.6);

  if (request.relatorio_visita) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0F2747').text('Registro técnico');
    doc.font('Helvetica').fontSize(9.5).fillColor('#1B1E22').text(
      buildCompletionSummary({ request, approvedParts, technician: technician?.nome, includeStatusIcon: false }),
      56, doc.y, { width: 483 }
    );
  }
  doc.moveDown(1);

  if (doc.y > 430) {
    doc.addPage();
    drawHeader(doc, 'Termo de Conclusão — Continuação');
  } else {
    doc.strokeColor('#e2e8f0').lineWidth(1).moveTo(56, doc.y).lineTo(539, doc.y).stroke();
    doc.moveDown(1);
  }

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#0F2747').text('DECLARAÇÃO E ACEITE');
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(9.5).fillColor('#1B1E22').text(
    'O aceitante abaixo identificado declarou ter acompanhado e/ou estar autorizado a representar o contratante para confirmar a conclusão do serviço descrito acima, e que as informações apresentadas correspondem ao atendimento realizado nesta visita técnica.',
    56, doc.y, { width: 483, align: 'justify' }
  );
  doc.moveDown(1);

  const acceptRows = [
    ['Nome do aceitante', aceite.nome_aceitante],
    ['Documento', aceite.documento_aceitante || '—'],
    ['Cargo/função', aceite.cargo_aceitante || '—'],
    ['E-mail', aceite.email_aceitante || '—'],
    ['Data/hora do aceite', formatDateTime(aceite.criado_em) || '—'],
    ['Endereço IP', aceite.ip || '—'],
    ['Código de validação', aceite.codigo_validacao],
    ['Versão do termo', aceite.versao_termo],
    ['Hash do documento', aceite.hash_documento]
  ];
  doc.font('Helvetica').fontSize(9.5).fillColor('#1B1E22');
  acceptRows.forEach(([label, value]) => {
    doc.font('Helvetica-Bold').text(`${label}: `, 56, doc.y, { continued: true, width: 483 });
    doc.font('Helvetica').text(String(value));
  });

  doc.moveDown(1.2);
  if (doc.y > doc.page.height - doc.page.margins.bottom - 110) {
    doc.addPage();
    drawHeader(doc, 'Termo de Conclusão — Validação');
  }
  const qrY = doc.y;
  doc.image(qrDataUrl, 56, qrY, { width: 90 });
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#0F2747').text('Validar este documento', 156, qrY + 30, { width: 300 });
  doc.font('Helvetica').fontSize(8.5).fillColor('#64748b').text(validationUrl, 156, qrY + 46, { width: 300 });

  return doc;
}

module.exports = { generateTermoConclusaoPdf };
