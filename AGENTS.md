# AGENTS.md

## Communication

Use Traditional Chinese for maintainer-facing notes unless the issue or PR is written in English.

## Project Scope

This repository is the public, self-hosted trading journal edition. Keep it generic for individual traders deploying on their own laptop, server, or NAS.

Do not add private finance, broker-account mapping, or maintainer-specific deployment logic to this repo.

## Core Commands

```bash
npm run dev
npm run lint
npm run test
npm run build
docker compose up -d --build
```

## Architecture

- Next.js App Router under `src/app`
- SQLite via Drizzle ORM and `better-sqlite3`
- Database schema in `src/lib/db/schema.ts`
- First-run schema/bootstrap in `src/lib/db/index.ts`
- Reusable UI under `src/components`
- Trade math helpers under `src/lib`

## Public Repo Safety Rules

- Never commit `.env`, `data/`, `uploads/`, broker exports, screenshots, account IDs, or API tokens.
- Demo data must be synthetic.
- Keep deployment docs generic. Use `example.com`, `./data`, and `./uploads` style examples.
- Avoid hard-coded broker accounts, personal names, private domains, or private NAS paths.
