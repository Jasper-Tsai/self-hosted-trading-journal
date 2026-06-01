# Deployment Guide

Self-Hosted Trading Journal can run on a laptop, private server, or NAS using Docker Compose.

## Local Docker Compose

```bash
cp .env.example .env
```

Edit `.env`:

```bash
JOURNAL_USERNAME=admin
JOURNAL_PASSWORD=replace-with-a-private-password
JOURNAL_SESSION_SECRET=replace-with-a-long-random-string
JOURNAL_SECURE_COOKIES=false
```

Start:

```bash
docker compose up -d --build
```

Open `http://localhost:3000`.

## NAS / Private Server

Recommended volume layout:

```text
project/
  docker-compose.yml
  .env
  data/
    db.sqlite
  uploads/
```

Back up:

- `.env`
- `data/db.sqlite`
- `uploads/`

Do not commit these files to git.

## HTTPS Reverse Proxy

When serving only over HTTPS:

```bash
JOURNAL_SECURE_COOKIES=true
```

Recommended layers:

- Private network or VPN when possible
- Reverse-proxy authentication for internet-facing deployments
- HTTPS certificate renewal monitoring
- Regular SQLite backups

## Smoke Test

After deployment:

```bash
curl -i http://localhost:3000/api/auth/me
```

Expected: `200` with `authenticated: false`.

Unauthenticated protected API:

```bash
curl -i http://localhost:3000/api/products
```

Expected: `401`.

Then log in through the UI and verify the dashboard loads.
