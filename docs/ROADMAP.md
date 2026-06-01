# Roadmap

This roadmap keeps the public edition focused on self-hosted trading journal workflows.

## v0.2 - Import Reliability

- Broker CSV adapter framework
- Synthetic fixtures for common broker/export shapes
- Import preview with validation warnings
- Duplicate detection during CSV import
- Clear import error messages for missing or malformed fields

## v0.3 - Backup and Deployment Hardening

- Built-in SQLite backup/export guide
- Restore guide for Docker and NAS deployments
- Health check documentation for reverse proxies
- Optional read-only demo mode
- Hardened deployment examples for private LAN, VPN, and HTTPS reverse proxy setups

## v0.4 - Review Workflow

- Trade review checklist templates
- Strategy tag quality checks
- Session/day notes
- Weekly and monthly review exports
- More granular filters for product, broker, strategy, and time window

## v0.5 - Community Adapters

- Community-maintained CSV mappings
- Adapter test fixtures
- Import documentation for each supported broker/export format
- Issue template automation for new CSV format requests

## Long-Term Direction

- Keep the app local-first and easy to self-host
- Make sensitive trading data portable and private by default
- Improve review workflows without adding broker execution or signal features
- Keep public examples synthetic and safe to share

## Non-Goals

- Broker order placement
- Copy trading
- Trade signals or financial advice
- Cloud multi-tenant SaaS
- Collection of user trading data
