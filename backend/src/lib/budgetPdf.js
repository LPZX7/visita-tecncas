const PDFDocument = require('pdfkit');
const { drawHeader, money } = require('./pdfHeader');
const { buildRealizado } = require('./visitaTecnicaFormat');

function generateBudgetPdf({ budget, request, company, unit, items }) {
  const doc = new PDFDocument({ size: 'A4', margin: 56 });

  drawHeader(doc, 'VISITA TÉCNICA');

  const statusLabel = budget.status === 'Aprovado' ? 'APROVADO PELO CLIENTE' : budget.status;
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#0F2747').text(`Orçamento — ${request.descricao}`);
  doc.font('Helvetica').fontSize(9).fillColor('#64748b').text(`Status: ${statusLabel} · Gerado em ${new Date(budget.criado_em).toLocaleDateString('pt-BR')}`);
  doc.moveDown(1.2);

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#0F2747').text('CLIENTE');
  doc.font('Helvetica').fontSize(10).fillColor('#1B1E22').text(company?.razao_social || '—');
  if (unit) doc.text(`${unit.tipo}: ${unit.nome}`);
  doc.moveDown(1);

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#0F2747').text('VALORES');
  doc.moveDown(0.3);

  const rows = [
    ['Peças e materiais', money(budget.pecas_total)],
    ['Deslocamento', money(budget.deslocamento)]
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

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#0F2747').text('SERVIÇO', 56, doc.y);
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(10).fillColor('#1B1E22');
  doc.text(`Motivo da troca: ${budget.motivo_troca || 'não informado'}`, 56);
  doc.text(`Informações relevantes: ${budget.observacoes_tecnicas || 'nenhuma'}`, 56);
  doc.moveDown(1);

  if (budget.status === 'Aprovado') {
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#0F2747').text('REALIZADO', 56, doc.y);
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).fillColor('#1B1E22')
      .text(buildRealizado(items || []).replace(/^REALIZADO:\s*/, ''), 56, doc.y, { width: 483 });
    doc.moveDown(0.6);

    doc.font('Helvetica-Bold').fontSize(11).fillColor('#0F2747').text('STATUS: APROVADO PELO CLIENTE', 56, doc.y);
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9.5).fillColor('#1B1E22')
      .text('AUTORIZAÇÃO: Cliente autorizou a realização da visita técnica e a substituição da peça.', 56, doc.y, { width: 483 });
    if (budget.autorizado_por) {
      doc.text(`Autorizado por: ${budget.autorizado_por}`, 56);
    }
    if (budget.aprovado_em) {
      doc.text(`Data/hora da autorização: ${new Date(budget.aprovado_em).toLocaleString('pt-BR')}`, 56);
    }
    doc.moveDown(1);
  }

  doc.font('Helvetica').fontSize(8.5).fillColor('#94a3b8')
    .text('Este documento é um orçamento e não constitui cobrança. Valores sujeitos a confirmação após aprovação.', 56, doc.y, { width: 483 });

  return doc;
}

module.exports = { generateBudgetPdf };
