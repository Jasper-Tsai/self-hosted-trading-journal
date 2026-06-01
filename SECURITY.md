# Security Policy

Self-Hosted Trading Journal is designed for local and private-network deployments. Trading journals often contain sensitive screenshots, broker exports, notes, P&L, and execution metadata, so data minimization and responsible disclosure matter.

## Reporting a Vulnerability

Please do not open public issues containing exploit details, real trade exports, screenshots, account numbers, API tokens, or personal information.

For sensitive reports, contact the maintainer privately before sharing details publicly.

When reporting, include:

- A concise description of the issue
- Affected route, component, or deployment path
- Minimal reproduction steps using synthetic data
- Expected and actual behavior
- Whether the issue affects local-only, LAN, reverse-proxy, or internet-exposed deployments

## Supported Versions

This project is early-stage. Security fixes target the latest `main` branch and latest release.

## Current Security Model

- Local username/password authentication
- Signed HTTP-only session cookie
- SQLite data stored on the host or mounted NAS volume
- Uploaded files stored on the host or mounted NAS volume
- No Firebase, Google OAuth, Firestore, cloud storage, or third-party auth provider
- Docker Compose fails closed when production auth secrets are missing

## Deployment Guidance

Before exposing the app outside your own machine or LAN:

- Change the default `JOURNAL_PASSWORD`
- Set a long random `JOURNAL_SESSION_SECRET`
- Set `JOURNAL_SECURE_COOKIES=true` when serving only over HTTPS
- Prefer VPN, reverse-proxy authentication, or private network access
- Back up `data/db.sqlite`
- Keep `data/`, `uploads/`, and `.env` out of git

See [Threat Model](docs/THREAT_MODEL.md) for a fuller breakdown.
