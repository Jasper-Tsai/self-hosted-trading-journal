# Changelog

## Unreleased

### Added

- Manual P&L records for broker-reported results when individual fills are not available
- A standalone Prop Firm journal for evaluation/funded trades and payout records
- Daily review templates for session scenarios, discipline checks, error tags, and lessons

### Security and scope

- All new records use the existing local session authentication and local SQLite database
- This release adds no broker integration, order execution, copy trading, or external account access

## 0.1.0 - 2026-06-02

Initial public release.

### Added

- Local-first trading journal with SQLite persistence
- Trade CRUD, strategy labels, broker/product configuration
- Dashboard, calendar, trade list, review, and strategy performance views
- CSV import/export
- Local username/password auth with signed HTTP-only cookies
- Dockerfile and Docker Compose deployment
- Synthetic demo seed
- CI for audit, lint, tests, build, Docker image build, and Docker Compose smoke test
- Public security, contribution, roadmap, threat model, and Codex maintenance docs

### Security

- Removed private Firebase/Google auth dependency from the public edition
- Removed private deployment, broker, and maintainer-specific finance features
- Added fail-closed production auth requirements for Docker Compose
- Added gitleaks validation during public release preparation
