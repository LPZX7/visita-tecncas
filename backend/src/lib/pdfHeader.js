function drawHeader(doc, subtitle) {
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#0F2747').text('Mirontec Service', { align: 'left' });
  doc.font('Helvetica').fontSize(9).fillColor('#64748b').text(subtitle);
  doc.moveDown(1.2);
  doc.strokeColor('#e2e8f0').lineWidth(1).moveTo(56, doc.y).lineTo(539, doc.y).stroke();
  doc.moveDown(1);
}

function money(value) {
  return Number(value || 0)
    .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    .replace(/\u00a0/g, ' ');
}

module.exports = { drawHeader, money };
