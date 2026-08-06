const PDFDocument = require('pdfkit');
const { drawHeader, money } = require('./pdfHeader');

function generateBudgetPdf({ budget, request, company, rule, items }) {
  const doc = new PDFDocument({ size: 'A4', margin: 56 });

  drawHeader(doc, 'Orçamento de Serviço');

  doc.font('Helvetica-Bold').fontSize(13).fillColor('#0F2747').text(`Orçamento — ${request.descricao}`);
  doc.font('Helvetica').fontSize(9).fillColor('#64748b').text(`Status: ${budget.status} · Gerado em ${new Date(budget.criado_em).toLocaleDateString('pt-BR')}`);
  doc.moveDown(1.2);

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#0F2747').text('CLIENTE');
  doc.font('Helvetica').fontSize(10).fillColor('#1B1E22').text(company?.razao_social || '—');
  doc.moveDown(0.8);

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#0F2747').text('REGRA DE COBRANÇA');
  doc.font('Helvetica').fontSize(10).fillColor('#1B1E22').text(rule?.tipo || '—');
  doc.moveDown(1);

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#0F2747').text('VALORES');
  doc.moveDown(0.3);

  const rows = [
    ['Valor base (regra de cobrança)', money(budget.base_total)],
    ['Peças e materiais', money(budget.pecas_total)],
    ['Mão de obra', money(budget.mao_obra_total)],
    ['Deslocamento', money(budget.deslocamento)],
    ['Urgência', money(budget.urgencia)]
  ];

  doc.font('Helvetica').fontSize(10).fillColor('#1B1E22');
  rows.forEach(([label, value]) => {
    const y = doc.y;
    doc.text(label, 56, y);
    doc.text(value, 400, y, { width: 139, align: 'right' });
  });

  doc.moveDown(0.4);
  doc.strokeColor('#e2e8f0').lineWidth(1).moveTo(56, doc.y).lineTo(539, doc.y).stroke();
  doc.moveDown(0.4);

  doc.font('Helvetica-Bold').fontSize(12).fillColor('#0F2747');
  const totalY = doc.y;
  doc.text('VALOR TOTAL', 56, totalY);
  doc.text(money(budget.total), 400, totalY, { width: 139, align: 'right' });
  doc.x = 56;
  doc.moveDown(1.5);

  if (items?.length > 0) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#0F2747').text('ITENS / PEÇAS', 56, doc.y);
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).fillColor('#1B1E22');
    items.forEach((item) => {
      const y = doc.y;
      doc.text(`${item.nome} × ${item.quantidade}`, 56, y);
      doc.text(money(item.valor_unitario * item.quantidade), 400, y, { width: 139, align: 'right' });
    });
    doc.x = 56;
    doc.moveDown(1);
  }

  doc.font('Helvetica').fontSize(8.5).fillColor('#94a3b8')
    .text('Este documento é um orçamento e não constitui cobrança. Valores sujeitos a confirmação após aprovação.', 56, doc.y, { width: 483 });

  return doc;
}

module.exports = { generateBudgetPdf };
