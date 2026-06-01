# Threat Model

Self-Hosted Trading Journal stores information that can be sensitive even when it is not a traditional application secret: trade screenshots, broker exports, strategy notes, P&L, account metadata accidentally included in screenshots, and deployment configuration.

## Assets

- SQLite database: `data/db.sqlite`
- Uploaded screenshots/files: `uploads/`
- Environment file: `.env`
- Session cookie: `stj_session`
- Broker CSV exports and imported trade records
- Deployment host, NAS, or reverse proxy configuration

## Trust Boundaries

- Browser to Next.js app
- Next.js app to SQLite database
- Next.js app to local upload volume
- Docker container to mounted host volumes
- Optional reverse proxy or VPN in front of the app
- Maintainer/developer machine to public GitHub repository

## Expected Deployment Modes

1. Local laptop only
2. Private LAN or NAS
3. HTTPS reverse proxy with additional access control

This app is not designed to be exposed directly to the public internet without a hardened deployment layer.

## Current Controls

- Local username/password auth
- Signed HTTP-only session cookie
- Production/Docker auth fails closed when password/session secret are missing
- Optional `JOURNAL_SECURE_COOKIES=true` for HTTPS-only deployments
- `.gitignore` excludes `.env`, SQLite databases, `data/`, `uploads/`, and local runtime state
- CI covers audit, lint, tests, build, Docker image build, and Docker Compose smoke test
- Public edition does not use Firebase, Google OAuth, Firestore, cloud storage, or third-party auth

## Key Risks and Mitigations

| Risk | Impact | Current Mitigation | Future Work |
| --- | --- | --- | --- |
| Default password exposed outside LAN | Unauthorized access | README/security warnings; Docker requires explicit secrets | First-run password setup flow |
| SQLite database committed accidentally | Sensitive trade data leak | `.gitignore`; docs; gitleaks release checks | Optional local pre-commit hook |
| Uploaded screenshots include account data | Privacy leak | Docs warn against committing uploads/screenshots | Screenshot redaction guide |
| CSV importer accepts malformed data | Incorrect journal records | Validation in import flow | Adapter fixtures and richer import preview |
| Reverse proxy misconfiguration | Public exposure | Deployment guidance recommends VPN/reverse proxy auth | Hardened reverse proxy examples |
| Dependency vulnerability | App compromise | `npm audit`, Dependabot, CI | Security release checklist |
| Cookie sent over HTTP when internet-exposed | Session theft | `JOURNAL_SECURE_COOKIES=true` for HTTPS | Deployment lint/check command |

## Data Handling Rules

- Public examples must use synthetic data
- Issues must not include real broker exports
- Screenshots must not show account numbers, names, emails, addresses, or balances
- Contributors should reduce real CSV shapes to fake fixtures before sharing

## Security Review Checklist

Use this checklist for PRs touching auth, uploads, import, database, or deployment:

- Does the change preserve local-first storage?
- Does unauthenticated API access still return `401`?
- Does Docker Compose still fail closed without required auth secrets?
- Are new files covered by `.gitignore` if they may contain local data?
- Are fixtures synthetic?
- Does the Docker Compose smoke test still pass?
- Does the README/security documentation need an update?
