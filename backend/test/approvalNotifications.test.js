const test = require('node:test');
const assert = require('node:assert/strict');
const { buildApprovalEmail, collectApprovalRecipients } = require('../src/lib/approvalNotifications');

test('seleciona gestores ativos e o técnico responsável sem duplicar e-mails', () => {
  const recipients = collectApprovalRecipients([
    { id: 'g1', nome: 'Gestor 1', email: 'GESTOR@mirontec.com.br', role: 'gestor', ativo: true },
    { id: 'g2', nome: 'Gestor inativo', email: 'inativo@mirontec.com.br', role: 'gestor', ativo: false },
    { id: 't1', nome: 'Técnico', email: 'tecnico@mirontec.com.br', role: 'tecnico', ativo: true },
    { id: 't2', nome: 'Outro técnico', email: 'outro@mirontec.com.br', role: 'tecnico', ativo: true },
    { id: 'a1', nome: 'Analista', email: 'analista@mirontec.com.br', role: 'analista', ativo: true },
    { id: 'g3', nome: 'Mesmo e-mail', email: 'gestor@mirontec.com.br', role: 'gestor', ativo: true }
  ], 't1');

  assert.deepEqual(recipients.map((item) => item.notification_email), [
    'gestor@mirontec.com.br',
    'tecnico@mirontec.com.br'
  ]);
});

test('usa e-mail do Milvus como alternativa quando o e-mail principal é inválido', () => {
  const recipients = collectApprovalRecipients([
    { id: 'g1', email: 'inválido', milvus_email: 'gestor@mirontec.com.br', role: 'gestor', ativo: true }
  ]);

  assert.equal(recipients[0].notification_email, 'gestor@mirontec.com.br');
});

test('e-mail de orçamento inclui dados operacionais e não expõe CPF', () => {
  const content = buildApprovalEmail({
    kind: 'budget',
    request: {
      numero: 42,
      milvus_codigo: '9876',
      descricao: '<script>Falha na catraca</script>',
      aprovacao_cpf: '123.456.789-00'
    },
    company: { razao_social: 'Cliente & Filhos' },
    budget: { total: 1250.5, aprovacao_nome: 'Maria Silva', aprovacao_cpf: '123.456.789-00' },
    contract: { numero: 'CTR-00042' },
    technician: { nome: 'Abson' }
  });

  assert.match(content.subject, /orçamento e visita aprovados/i);
  assert.match(content.subject, /chamado #42/i);
  assert.match(content.text, /R\$\s*1\.250,50/);
  assert.match(content.text, /CTR-00042/);
  assert.match(content.html, /Cliente &amp; Filhos/);
  assert.doesNotMatch(content.html, /<script>/);
  assert.doesNotMatch(`${content.text}${content.html}`, /123\.456\.789-00/);
  assert.match(content.html, /Autorizada automaticamente/);
});

test('e-mail de visita identifica a autorização e o técnico responsável', () => {
  const content = buildApprovalEmail({
    kind: 'visit',
    request: {
      numero: 17,
      milvus_codigo: '555',
      descricao: 'Manutenção preventiva',
      aprovacao_nome: 'João Cliente'
    },
    company: { razao_social: 'Empresa X' },
    technician: { milvus_nome: 'Abson Técnico' }
  });

  assert.match(content.subject, /visita autorizada/i);
  assert.match(content.text, /Abson Técnico/);
  assert.match(content.text, /João Cliente/);
  assert.match(content.html, /Visita autorizada/);
});
