# Self-Hosted Trading Journal

A local-first trading journal for futures and active traders. It runs on your laptop, server, or NAS with Next.js and SQLite.

## Features

- Trade CRUD with entry/exit, quantity, fees, stops, targets, notes, and strategy labels
- Product and broker configuration from the UI
- P&L, R multiple, win rate, heatmap, calendar, best/worst trades, and strategy performance views
- CSV import/export for portable trade data
- Screenshot upload to a local/NAS volume
- SQLite persistence with automatic first-run schema creation
- Docker Compose deployment for local machines and NAS devices

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

The app creates `data/db.sqlite` on first run and seeds basic products, a `Manual` broker, and a `Default` strategy.

Default local login:

- Username: `admin`
- Password: `change-me-now`

Change the password before exposing the app outside your own machine or LAN.

To load synthetic demo data:

```bash
npm run seed:demo
```

The demo seed creates local test trades only. It does not include real account, broker, or personal data.

## Docker

Create and edit your `.env` first:

```bash
cp .env.example .env
```

Set `JOURNAL_PASSWORD` and `JOURNAL_SESSION_SECRET` to private values before starting the container. Docker Compose intentionally fails closed if these are missing.

```bash
docker compose up -d --build
```

Default URL: `http://localhost:3000`

To run on another host port:

```bash
APP_PORT=3003 docker compose up -d --build
```

Persistent paths:

- `./data` -> SQLite database
- `./uploads` -> uploaded screenshots/files

## Configuration

Copy the example file if you want to override defaults:

```bash
cp .env.example .env
```

Useful variables:

```bash
APP_BRAND_NAME="Self-Hosted Trading Journal"
APP_PORT=3000
JOURNAL_USERNAME=admin
JOURNAL_PASSWORD=your-private-password
JOURNAL_SESSION_SECRET=replace-with-a-long-random-string
JOURNAL_SECURE_COOKIES=false
DB_PATH="./data/db.sqlite"
UPLOADS_DIR="./uploads"
NEXT_PUBLIC_USD_TWD_RATE=31.5
```

## CSV Import

Use the `/csv` page to import/export trades. Keep sample files synthetic; do not commit real trade exports, screenshots, account IDs, or broker statements.

## Security Notes

This public edition uses local username/password auth with a signed HTTP-only cookie. It does not connect to Firebase, Google OAuth, or any third-party auth provider.

Before exposing it outside your LAN:

- Change `JOURNAL_PASSWORD`
- Set a long random `JOURNAL_SESSION_SECRET`
- Set `JOURNAL_SECURE_COOKIES=true` when serving only over HTTPS
- Prefer putting it behind NAS/VPN/reverse-proxy auth as an additional layer

Do not commit:

- `.env` files
- `data/`
- `uploads/`
- broker statements or real CSV exports
- screenshots containing account numbers or personal information

## Development

```bash
npm audit
npm run lint
npm run test
npm run build
docker build -t self-hosted-trading-journal:local .
```

GitHub Actions runs audit, lint, tests, production build, Docker image build, and a Docker Compose smoke test on pushes to `main` and pull requests.

## License

MIT
