const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWelcomeEmail } = require('../src/lib/welcomeEmail');

test('e-mail de boas-vindas identifica usuário, perfil e acesso ao portal', () => {
  const content = buildWelcomeEmail({ nome: 'Maria da Silva', role: 'cliente' });

  assert.equal(content.subject, 'Bem-vindo ao Mirontec Service');
  assert.match(content.text, /Olá, Maria!/);
  assert.match(content.text, /Perfil de acesso: Cliente/);
  assert.match(content.text, /\/login/);
  assert.match(content.html, /Acessar minha conta/);
  assert.match(content.html, /Perfil de acesso:<\/strong> Cliente/);
});

test('e-mail não expõe senha e escapa o nome antes de montar o HTML', () => {
  const content = buildWelcomeEmail({ nome: '<script>alert(1)</script>', role: 'tecnico' });
  const allContent = `${content.text}\n${content.html}`;

  assert.doesNotMatch(content.html, /<script>/);
  assert.match(content.html, /&lt;script&gt;/);
  assert.match(content.html, /Técnico de Campo/);
  assert.doesNotMatch(allContent, /senha temporária|sua senha é|password:/i);
  assert.match(allContent, /senha nunca é enviada/i);
});
