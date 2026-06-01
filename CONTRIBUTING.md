# Contributing

Thanks for helping improve Self-Hosted Trading Journal. This project is built for traders who need a local-first journal and want to keep sensitive trading data under their own control.

## Good First Contributions

- Broker CSV sample mappings using synthetic data
- Import validation improvements
- Docker/NAS deployment notes
- Accessibility fixes
- Tests for trade grouping, P&L, or CSV parsing
- Documentation improvements

## Local Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Default local login:

- Username: `admin`
- Password: `change-me-now`

To load synthetic demo data:

```bash
npm run seed:demo
```

## Required Checks

Run these before opening a PR:

```bash
npm audit
npm run lint
npm run test
npm run build
docker build -t self-hosted-trading-journal:local .
```

If your change touches Docker, auth, database bootstrapping, or deployment behavior, also run a Docker Compose smoke test:

```bash
APP_PORT=3003 \
JOURNAL_USERNAME=admin \
JOURNAL_PASSWORD=local-test-password \
JOURNAL_SESSION_SECRET=local-test-session-secret-0123456789 \
JOURNAL_SECURE_COOKIES=false \
docker compose up -d --build
```

Then verify that unauthenticated API access returns `401`, login returns `200`, and authenticated API access returns `200`.

## Data Safety

Use synthetic demo data only. Do not commit or paste:

- Real broker exports
- Screenshots with account or personal information
- Account IDs, names, addresses, emails, or phone numbers
- API tokens, cookies, or session secrets
- `.env` files
- SQLite databases
- Uploaded files

If a bug requires a real CSV shape, reduce it to a synthetic fixture with the same column names and fake values.

## Scope

This public edition should stay useful for general self-hosted trading journals.

In scope:

- Trade journal workflows
- Local-first storage
- CSV import/export
- Docker/NAS deployment
- Security hardening for self-hosted use

Out of scope:

- Broker order execution
- Copy trading or trade signals
- Cloud multi-tenant SaaS features
- Private finance tracking
- Partner settlement or maintainer-specific deployment scripts

## Pull Request Guidelines

- Keep changes focused
- Add or update tests when behavior changes
- Update docs when setup, deployment, auth, or CSV behavior changes
- Use synthetic data in fixtures and screenshots
- Explain security or data-safety implications when relevant

## Maintainer Review Priorities

PR review prioritizes:

1. Data safety
2. Auth and deployment correctness
3. SQLite/data portability
4. Clear tests
5. Simple UX for self-hosted users
