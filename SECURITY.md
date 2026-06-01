# Security Policy

Please do not open public issues containing real trade exports, screenshots, account numbers, API tokens, or personal information.

For sensitive vulnerability reports, contact the maintainer privately before sharing details publicly.

This app is local-first and uses local username/password authentication with a signed HTTP-only cookie. It does not use Firebase, Google OAuth, or any third-party auth provider.

Before exposing it outside your LAN:

- Change the default `JOURNAL_PASSWORD`
- Set a long random `JOURNAL_SESSION_SECRET`
- Prefer adding VPN, reverse-proxy authentication, or another access-control layer
