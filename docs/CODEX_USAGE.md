# Codex Usage Plan

This project is a good fit for Codex-assisted open-source maintenance because many important tasks are repetitive, testable, and security-sensitive.

## Maintainer Workflows

Codex can help with:

- Pull request review for auth, import, deployment, and data-safety regressions
- Issue triage for broker CSV format requests
- Test generation for CSV adapters and trade grouping behavior
- Dependency update review from Dependabot PRs
- Release note drafting
- Docker/NAS deployment smoke-test improvements
- Threat model updates when auth, upload, or deployment paths change

## API Credit Use

API credits would be used for maintainer automation around:

- Summarizing and classifying incoming issues
- Drafting reproducible test cases from CSV import reports
- Reviewing pull requests for data leakage and deployment regressions
- Generating changelog and release notes from merged PRs
- Building regression tests for broker CSV adapters

## Codex Security Fit

Codex Security would be useful for:

- Auth route review
- Cookie/session handling review
- CSV import and upload path review
- Docker and reverse-proxy deployment review
- Secret exposure prevention
- Public repo hygiene checks before releases

## Guardrails

Codex-generated changes should still pass:

```bash
npm audit
npm run lint
npm run test
npm run build
docker build -t self-hosted-trading-journal:local .
```

For deployment-sensitive changes, also run the Docker Compose smoke test documented in [Contributing](../CONTRIBUTING.md).

## Human Review Priorities

Human maintainers remain responsible for:

- Accepting new broker CSV formats
- Deciding product scope
- Reviewing security-sensitive changes
- Publishing releases
- Ensuring public fixtures and screenshots remain synthetic
