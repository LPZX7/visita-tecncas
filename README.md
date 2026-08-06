# Sistema de Gestão de Visitas Técnicas

Sistema de gestão de visitas técnicas com perfis Cliente, Técnico, Analista e Gestor: chamados, atribuição de técnico, check-in/check-out de visita, orçamentos com aprovação do cliente e notificações por email.

## Estrutura

- `backend/`: API Node.js com Express e SQLite (via `node:sqlite`, nativo do Node — requer Node.js 22.5+).
- `frontend/`: Aplicação React (Vite) com routing e telas para cada perfil.

## Como iniciar

1. `npm install` em `backend/` e em `frontend/`.
2. Copie `backend/.env.example` para `backend/.env` e `frontend/.env.example` para `frontend/.env`, e preencha o que for usar (Gmail para notificações, Google Maps para mapas incorporados — ambos opcionais, o sistema funciona sem eles).
3. `npm run dev` em `backend/` (porta 4100) e `npm run start` em `frontend/` (porta 3000).
4. Login padrão: `admin@empresa.com` / `admin123` (criado automaticamente no primeiro acesso).

O banco de dados SQLite é criado em `backend/data/mirontec.db` na primeira execução.
