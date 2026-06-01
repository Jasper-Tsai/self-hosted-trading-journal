# CSV Import Guide

The CSV import/export page is designed for portable trade data. Use synthetic samples when reporting bugs or requesting new broker formats.

## Current Baseline

The importer expects normalized trade records with fields such as:

- `date`
- `symbol`
- `side`
- `entry_time`
- `entry_price`
- `exit_time`
- `exit_price`
- `qty`
- `broker`
- `fee`
- `strategy`
- `notes`

## Data Safety

Do not share real broker exports in public issues. If a broker export fails:

1. Copy the header row
2. Replace all values with fake data
3. Keep the same column order and data shape
4. Remove account IDs, names, order IDs, balances, and notes
5. Attach the synthetic sample to a broker CSV format request

## Adapter Roadmap

Planned importer improvements:

- Broker-specific adapter registry
- Import preview before writing to SQLite
- Duplicate detection
- Column mapping UI
- Synthetic fixtures for each supported broker/export format
- Better validation errors for missing or malformed fields
