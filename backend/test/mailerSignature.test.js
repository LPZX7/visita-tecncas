const test = require('node:test');
const assert = require('node:assert/strict');
const { buildEmailSignature, appendEmailSignature } = require('../src/lib/mailer');

test('gera assinatura usando nome e e-mail exatos do Milvus', () => {
  const signature = buildEmailSignature({
    nome: 'Nome local',
    email: 'local@example.com',
    milvus_nome: 'Felipe Matias Miron',
    milvus_email: 'felipe@mirontec.com.br',
    role: 'tecnico'
  });

  assert.match(signature.text, /Felipe Matias Miron/);
  assert.match(signature.text, /Técnico de Campo/);
  assert.match(signature.html, /felipe@mirontec\.com\.br/);
  assert.match(signature.html, /data-mirontec-signature="true"/);
});

test('escapa dados do usuário e não duplica assinatura', () => {
  const signature = buildEmailSignature({ nome: '<script>alert(1)</script>', role: 'analista' });
  assert.doesNotMatch(signature.html, /<script>/);
  assert.match(signature.html, /&lt;script&gt;/);

  const first = appendEmailSignature({ text: 'Mensagem', html: '<p>Mensagem</p>', signatureUser: null });
  const second = appendEmailSignature({ text: first.text, html: first.html, signatureUser: null });
  assert.equal((second.html.match(/data-mirontec-signature/g) || []).length, 1);
  assert.equal((second.text.match(/Atenciosamente,/g) || []).length, 1);
});
