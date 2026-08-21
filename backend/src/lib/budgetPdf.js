const PDFDocument = require('pdfkit');
const { drawHeader, money } = require('./pdfHeader');
const { buildAuthorizedService } = require('./visitaTecnicaFormat');
const { formatDateTime, sentence } = require('./technicalWriting');

function generateBudgetPdf({ budget, request, company, unit, items }) {
  const doc = new PDFDocument({ size: 'A4', margin: 56 });

  drawHeader(doc, 'VISITA TÉCNICA');

  const statusLabel = budget.status === 'Aprovado' ? 'APROVADO PELO CLIENTE' : budget.status;
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#0F2747').text(`Orçamento — ${request.descricao}`);
  doc.font('Helvetica').fontSize(9).fillColor('#64748b').text(`Status: ${statusLabel} · Gerado em ${formatDateTime(budget.criado_em)}`);
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

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#0F2747').text('PROBLEMA IDENTIFICADO', 56, doc.y);
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(10).fillColor('#1B1E22').text(sentence(request.descricao), 56, doc.y, { width: 483 });
  if (budget.motivo_troca) {
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#0F2747').text('MOTIVO DA TROCA', 56, doc.y);
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).fillColor('#1B1E22').text(sentence(budget.motivo_troca), 56, doc.y, { width: 483 });
  }
  if (budget.observacoes_tecnicas) {
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#0F2747').text('INFORMAÇÕES DO ATENDIMENTO', 56, doc.y);
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).fillColor('#1B1E22').text(sentence(budget.observacoes_tecnicas), 56, doc.y, { width: 483 });
  }
  doc.moveDown(1);

  if (budget.status === 'Aprovado') {
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#0F2747').text('SERVIÇO AUTORIZADO', 56, doc.y);
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).fillColor('#1B1E22')
      .text(buildAuthorizedService(items || []), 56, doc.y, { width: 483 });
    doc.moveDown(0.8);

    const statusY = doc.y;
    doc.roundedRect(56, statusY, 155, 23, 7).fill('#DCFCE7');
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#16734A').text('APROVADO PELO CLIENTE', 68, statusY + 7);
    doc.y = statusY + 34;

    doc.font('Helvetica-Bold').fontSize(11).fillColor('#0F2747').text('AUTORIZAÇÃO', 56, doc.y);
    doc.moveDown(0.3);
    const authorizationText = items?.length
      ? `O cliente autorizou a realização da visita técnica e a substituição ${items.length === 1 ? 'da peça descrita' : 'das peças descritas'} neste orçamento.`
      : 'O cliente autorizou a realização da visita técnica.';
    doc.font('Helvetica').fontSize(9.5).fillColor('#1B1E22')
      .text(authorizationText, 56, doc.y, { width: 483 });
    const responsible = budget.aprovacao_nome || budget.autorizado_por;
    if (responsible) doc.text(`Autorizado por ${responsible}${budget.aprovado_em ? ` em ${formatDateTime(budget.aprovado_em)}` : ''}.`, 56);
    doc.moveDown(1);
  }

  const footer = budget.status === 'Aprovado'
    ? 'Este documento registra o orçamento aprovado pelo cliente e não constitui cobrança.'
    : 'Este documento é um orçamento e não constitui cobrança. Valores sujeitos à aprovação do cliente.';
  doc.font('Helvetica').fontSize(8.5).fillColor('#94a3b8').text(footer, 56, doc.y, { width: 483 });

  return doc;
}

module.exports = { generateBudgetPdf };
