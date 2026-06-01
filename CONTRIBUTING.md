# Contributing

## Local Checks

Run these before opening a PR:

```bash
npm run lint
npm run test
npm run build
```

## Data Safety

Use synthetic demo data only. Do not commit:

- real broker exports
- screenshots with account or personal information
- `.env` files
- SQLite databases
- uploaded files

## Scope

This public edition should stay useful for general self-hosted trading journals. Private finance tracking, partner/partner settlement, broker-account mapping, and maintainer-specific deployment scripts are out of scope.
