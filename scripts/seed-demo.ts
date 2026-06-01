import Database from 'better-sqlite3';
import path from 'path';
import { randomUUID } from 'crypto';
import '../src/lib/db';

const dbPath = process.env.DB_PATH ?? path.join(process.cwd(), 'data/db.sqlite');
const db = new Database(dbPath);

const insertTrade = db.prepare(`
  INSERT INTO trades (
    id, date, symbol, side, entry_time, entry_price, exit_time, exit_price,
    qty, broker, fee, notes, strategy, created_at, updated_at
  ) VALUES (
    @id, @date, @symbol, @side, @entry_time, @entry_price, @exit_time, @exit_price,
    @qty, @broker, @fee, @notes, @strategy, @created_at, @updated_at
  )
`);

const strategies = ['Breakout', 'Pullback', 'Opening Range', 'Mean Reversion'];
const symbols = ['MNQ', 'NQ'];
const now = new Date().toISOString();

for (let i = 0; i < 60; i++) {
  const d = new Date();
  d.setDate(d.getDate() - i);
  const date = d.toISOString().slice(0, 10);
  const side = i % 2 === 0 ? 'LONG' : 'SHORT';
  const symbol = symbols[i % symbols.length];
  const base = symbol === 'NQ' ? 21000 : 21000;
  const entry = base + ((i % 15) - 7) * 18;
  const move = ((i % 5) - 2) * 12 + (i % 3 === 0 ? 30 : -10);
  const exit = side === 'LONG' ? entry + move : entry - move;

  insertTrade.run({
    id: randomUUID(),
    date,
    symbol,
    side,
    entry_time: `${date}T09:${String((i * 7) % 60).padStart(2, '0')}:00`,
    entry_price: entry,
    exit_time: `${date}T10:${String((i * 11) % 60).padStart(2, '0')}:00`,
    exit_price: exit,
    qty: (i % 3) + 1,
    broker: 'Manual',
    fee: 0,
    notes: 'Synthetic demo trade',
    strategy: strategies[i % strategies.length],
    created_at: now,
    updated_at: now,
  });
}

console.log(`Seeded 60 synthetic demo trades into ${dbPath}`);
