const test = require('node:test');
const assert = require('node:assert/strict');
const {
  atualizarResponsavelChamado,
  criarChamado
} = require('../src/lib/milvus');

test('cria o chamado com o e-mail exato do responsável no Milvus', async (t) => {
  const previousToken = process.env.MILVUS_API_TOKEN;
  process.env.MILVUS_API_TOKEN = 'token-de-teste';
  let sentBody;
  t.mock.method(global, 'fetch', async (_url, options) => {
    sentBody = JSON.parse(options.body);
    return new Response('"6408"', { status: 200 });
  });

  try {
    const codigo = await criarChamado({
      clienteToken: 'cliente-1',
      assunto: 'Visita',
      descricao: 'Teste',
      email: 'cliente@example.com',
      tecnicoEmail: 'felipe@mirontec.com.br'
    });
    assert.equal(codigo, '6408');
    assert.equal(sentBody.chamado_tecnico, 'felipe@mirontec.com.br');
  } finally {
    if (previousToken === undefined) delete process.env.MILVUS_API_TOKEN;
    else process.env.MILVUS_API_TOKEN = previousToken;
  }
});

test('resolve o id do ticket antes de trocar o responsável', async (t) => {
  const previousToken = process.env.MILVUS_API_TOKEN;
  process.env.MILVUS_API_TOKEN = 'token-de-teste';
  const calls = [];
  t.mock.method(global, 'fetch', async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    if (url.includes('/chamado/listagem')) {
      return Response.json({ lista: [{ id: 99123, codigo: 6407 }] });
    }
    return new Response('123', { status: 200 });
  });

  try {
    await atualizarResponsavelChamado({
      ticketCodigo: '6407',
      tecnicoNome: 'Felipe Matias Miron'
    });
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1].body, {
      chamado_ids: '99123',
      chamado_tecnico: 'Felipe Matias Miron'
    });
  } finally {
    if (previousToken === undefined) delete process.env.MILVUS_API_TOKEN;
    else process.env.MILVUS_API_TOKEN = previousToken;
  }
});
