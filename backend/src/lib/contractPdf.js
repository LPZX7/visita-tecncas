const PDFDocument = require('pdfkit');
const { drawHeader, money } = require('./pdfHeader');

function generateContractPdf({ contract, budget, request, company, unit }) {
  const doc = new PDFDocument({ size: 'A4', margin: 56 });

  drawHeader(doc, 'Contrato de Prestação de Serviços de Manutenção Técnica');

  doc.font('Helvetica-Bold').fontSize(13).fillColor('#0F2747').text(`Contrato ${contract.numero}`);
  doc.font('Helvetica').fontSize(9).fillColor('#64748b').text(`Gerado em ${new Date(contract.criado_em).toLocaleDateString('pt-BR')}`);
  doc.moveDown(1.2);

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#0F2747').text('CONTRATADA');
  doc.font('Helvetica').fontSize(10).fillColor('#1B1E22').text('Mirontec Service — Manutenção e operações de campo');
  doc.moveDown(0.8);

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#0F2747').text('CONTRATANTE');
  doc.font('Helvetica').fontSize(10).fillColor('#1B1E22');
  doc.text(company.razao_social || '—');
  if (company.cnpj) doc.text(`CNPJ: ${company.cnpj}`);
  if (unit) doc.text(`${unit.tipo}: ${unit.nome}`);
  if (company.endereco) doc.text(company.endereco);
  doc.moveDown(1);

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#0F2747').text('OBJETO');
  doc.font('Helvetica').fontSize(10).fillColor('#1B1E22')
    .text(`Prestação de serviço técnico referente ao chamado: "${request.descricao}".`);
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

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#0F2747').text('CONDIÇÕES GERAIS', 56, doc.y);
  doc.moveDown(0.3);

  const fullWidth = 483;
  doc.font('Helvetica').fontSize(9.5).fillColor('#1B1E22');
  doc.text('1. O valor total acima foi aprovado pela CONTRATANTE e é devido conforme condições comerciais acordadas entre as partes.', 56, doc.y, { width: fullWidth, align: 'justify' });
  doc.moveDown(0.4);
  doc.text('2. Os serviços e peças descritos possuem garantia conforme política padrão da CONTRATADA, salvo condição diversa acordada por escrito.', 56, doc.y, { width: fullWidth, align: 'justify' });
  doc.moveDown(0.4);
  doc.text('3. Este contrato é gerado automaticamente a partir da aprovação do orçamento pela CONTRATANTE através do portal Mirontec Service ou de link de aprovação enviado por email, e tem validade entre as partes.', 56, doc.y, { width: fullWidth, align: 'justify' });
  doc.moveDown(0.4);
  doc.text('4. Fica eleito o foro da comarca da CONTRATADA para dirimir quaisquer dúvidas oriundas deste contrato.', 56, doc.y, { width: fullWidth, align: 'justify' });
  doc.moveDown(2.5);

  const sigY = doc.y;
  doc.strokeColor('#94a3b8').moveTo(56, sigY).lineTo(260, sigY).stroke();
  doc.strokeColor('#94a3b8').moveTo(335, sigY).lineTo(539, sigY).stroke();
  doc.font('Helvetica').fontSize(9).fillColor('#64748b');
  doc.text('Mirontec Service (Contratada)', 56, sigY + 6, { width: 204 });
  doc.text(company.razao_social || 'Contratante', 335, sigY + 6, { width: 204 });

  return doc;
}

module.exports = { generateContractPdf };
