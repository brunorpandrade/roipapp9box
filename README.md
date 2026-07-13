# ROIP APP 9BOX

Plataforma B2B SaaS de people analytics para PMEs brasileiras. Construção do
zero, dirigida por especificação canônica (DOC 00–07) e mockups HTML.

## Stack

- Next.js 15 (App Router) + tRPC 11
- MySQL 8 via Drizzle ORM (100% tipado — SQL cru é proibido)
- TypeScript strict
- Vitest (testes de integração contra banco real)

## Como rodar

```bash
cp .env.example .env
npm install
docker compose up -d          # sobe o MySQL 8 com healthcheck
npm run typecheck
npm run dev
```

## Regras do repositório

- Versões do package.json pinadas sem `^`; `package-lock.json` não versionado.
- Largura máxima de 100 colunas e um statement por linha (ESLint/Prettier).
- Nenhum `db.execute`/`` sql` `` fora das declarações de schema.
- Toda migration é executada contra o MySQL do compose antes do aceite.

## Estrutura

```
src/app/            rotas e telas (Next.js App Router)
src/server/routers/ routers tRPC
src/server/services/ serviços de negócio (todo export tem chamador)
src/db/schema/      schema Drizzle canônico (DOC 01)
src/db/migrations/  migrations SQL
scripts/            réguas de aceite (verify-schema, checks)
tests/              testes de integração
```
