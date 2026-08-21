# Sistema de Gestão de Visitas Técnicas

Sistema de gestão de visitas técnicas com perfis Cliente, Técnico, Analista e Gestor: chamados, atribuição de técnico, check-in/check-out de visita, orçamentos com aprovação do cliente e notificações por email.

## Estrutura

- `backend/`: API Node.js com Express e PostgreSQL (requer Node.js 22.5+).
- `frontend/`: Aplicação React (Vite) com routing e telas para cada perfil.

## Como iniciar

1. `npm install` em `backend/` e em `frontend/`.
2. Copie `backend/.env.example` para `backend/.env` e configure `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL` e `ADMIN_PASSWORD`. O envio de e-mail via Resend é opcional.
3. Execute `npm run dev:backend` e `npm run dev:frontend` na raiz. A API usa a porta 4100 e o frontend a porta 3000.
4. No primeiro start de um banco vazio, o gestor inicial é criado com as credenciais definidas no `.env`.

## Segurança em produção

- Use segredos longos e exclusivos para `JWT_SECRET` e `ADMIN_PASSWORD`.
- Em `NODE_ENV=production`, a aplicação recusa valores ausentes ou os placeholders do arquivo de exemplo.
- Configure `CORS_ORIGIN` somente com os endereços autorizados.
- Contas desativadas e alterações de perfil têm efeito imediato nas requisições autenticadas.

## Estoque BomControle

Configure `BOMCONTROLE_API_KEY` para importar produtos, preço de venda e saldo em estoque. A sincronização ocorre na inicialização, a cada 15 minutos e manualmente pelo botão na tela **Peças**. Na configuração da API Key no BomControle, associe uma tabela de preço e conceda acesso ao módulo de produtos/estoque.

## Verificação

- Backend: `npm test --prefix backend`
- Frontend: `npm run build --prefix frontend`
