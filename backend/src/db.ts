import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { TgUser } from './auth.js';

const dbPath = process.env.DB_PATH ?? './data/casino.db';
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  telegram_id   INTEGER PRIMARY KEY,
  username      TEXT,
  first_name    TEXT NOT NULL,
  balance       INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  total_clicks  INTEGER NOT NULL DEFAULT 0,
  last_click_ms INTEGER NOT NULL DEFAULT 0,
  last_wheel_spin INTEGER NOT NULL DEFAULT 0,
  referrer_id   INTEGER DEFAULT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cases (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  slug  TEXT NOT NULL UNIQUE,
  name  TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price > 0),
  loot  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS case_openings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER NOT NULL REFERENCES users(telegram_id),
  case_id     INTEGER NOT NULL REFERENCES cases(id),
  price       INTEGER NOT NULL,
  reward      INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS withdrawals (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER NOT NULL REFERENCES users(telegram_id),
  amount      INTEGER NOT NULL,
  status      TEXT DEFAULT 'pending',
  created_at  INTEGER DEFAULT (strftime('%s','now'))
);
`);

const seedLoot = [
  { reward: 20, weight: 40 },
  { reward: 50, weight: 30 },
  { reward: 100, weight: 15 },
  { reward: 200, weight: 10 },
  { reward: 500, weight: 4 },
  { reward: 2000, weight: 1 },
];
db.prepare(
  `INSERT OR IGNORE INTO cases (slug, name, price, loot) VALUES (?, ?, ?, ?)`,
).run('starter', 'Starter Case', 100, JSON.stringify(seedLoot));

export interface UserRow {
  telegram_id: number;
  username: string | null;
  first_name: string;
  balance: number;
  total_clicks: number;
  last_click_ms: number;
  last_wheel_spin: number;
  referrer_id: number | null;
  created_at: number;
}
interface CaseRow { id: number; slug: string; name: string; price: number; loot: string }
interface LootItem { reward: number; weight: number }

export class GameError extends Error {
  constructor(public code: string, public status = 400) {
    super(code);
  }
}

const upsertStmt = db.prepare(`
  INSERT INTO users (telegram_id, username, first_name, created_at)
  VALUES (@id, @username, @first_name, @now)
  ON CONFLICT(telegram_id) DO UPDATE SET
    username = excluded.username, first_name = excluded.first_name
`);
const getUserStmt = db.prepare<[number], UserRow>(`SELECT * FROM users WHERE telegram_id = ?`);

export function upsertUser(u: TgUser): UserRow {
  upsertStmt.run({
    id: u.id,
    username: u.username ?? null,
    first_name: u.first_name,
    now: Date.now(),
  });
  return getUserStmt.get(u.id)!;
}

export function listCases() {
  const rows = db.prepare<[], CaseRow>(`SELECT * FROM cases ORDER BY price`).all();
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    price: c.price,
    rewards: (JSON.parse(c.loot) as LootItem[]).map((l) => l.reward),
  }));
}

const clickStmt = db.prepare(`
  UPDATE users
  SET balance = balance + @reward,
      total_clicks = total_clicks + 1,
      last_click_ms = @now
  WHERE telegram_id = @id AND (@now - last_click_ms) >= @minInterval
`);

export function registerClick(telegramId: number, reward: number, minIntervalMs: number) {
  const res = clickStmt.run({ id: telegramId, reward, now: Date.now(), minInterval: minIntervalMs });
  if (res.changes === 0) throw new GameError('TOO_FAST', 429);
  const u = getUserStmt.get(telegramId)!;
  return { balance: u.balance, totalClicks: u.total_clicks, earned: reward };
}

function rollLoot(loot: LootItem[]): number {
  const total = loot.reduce((s, l) => s + l.weight, 0);
  let r = crypto.randomInt(total);
  for (const item of loot) {
    if (r < item.weight) return item.reward;
    r -= item.weight;
  }
  return loot[loot.length - 1].reward;
}

export const openCase = db.transaction((telegramId: number, caseId: number) => {
  const c = db.prepare<[number], CaseRow>(`SELECT * FROM cases WHERE id = ?`).get(caseId);
  if (!c) throw new GameError('CASE_NOT_FOUND', 404);

  const user = getUserStmt.get(telegramId);
  if (!user) throw new GameError('USER_NOT_FOUND', 404);
  if (user.balance < c.price) throw new GameError('INSUFFICIENT_FUNDS', 402);

  const reward = rollLoot(JSON.parse(c.loot) as LootItem[]);

  db.prepare(`UPDATE users SET balance = balance - ? + ? WHERE telegram_id = ?`)
    .run(c.price, reward, telegramId);
  db.prepare(
    `INSERT INTO case_openings (telegram_id, case_id, price, reward, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(telegramId, c.id, c.price, reward, Date.now());

  return { reward, price: c.price, balance: getUserStmt.get(telegramId)!.balance };
});

export function spinWheel(telegramId: number) {
  const user = getUserStmt.get(telegramId);
  if (!user) throw new GameError('USER_NOT_FOUND', 404);

  const now = Date.now();
  const cooldown = 10 * 1000; // 10 сек для теста

  if (now - user.last_wheel_spin < cooldown) {
    throw new GameError('WHEEL_COOLDOWN', 429);
  }

  const rewards = [50, 100, 200, 500, 1000, 5000];
  const reward = rewards[crypto.randomInt(rewards.length)];

  db.prepare(`UPDATE users SET balance = balance + ?, last_wheel_spin = ? WHERE telegram_id = ?`)
    .run(reward, now, telegramId);

  return { reward, balance: getUserStmt.get(telegramId)!.balance };
}

export function standardUpgrade(telegramId: number, bet: number, target: number) {
  const user = getUserStmt.get(telegramId);
  if (!user) throw new GameError('USER_NOT_FOUND', 404);
  if (user.balance < bet) throw new GameError('INSUFFICIENT_FUNDS', 402);
  if (bet <= 0 || target <= bet) throw new GameError('BAD_AMOUNT', 400);

  const chance = bet / target;
  const roll = crypto.randomInt(1_000_000) / 1_000_000;
  const win = roll <= chance;

  const newBalance = win ? user.balance - bet + target : user.balance - bet;
  
  db.prepare(`UPDATE users SET balance = ? WHERE telegram_id = ?`).run(newBalance, telegramId);

  return { win, newBalance, bet, target, chancePercent: Math.floor(chance * 100) };
}

export function mysteryUpgrade(telegramId: number, bet: number) {
  const user = getUserStmt.get(telegramId);
  if (!user) throw new GameError('USER_NOT_FOUND', 404);
  if (user.balance < bet) throw new GameError('INSUFFICIENT_FUNDS', 402);
  if (bet <= 0) throw new GameError('BAD_AMOUNT', 400);

  const minWin = Math.floor(bet / 10);
  const maxWin = Math.floor(bet * 10);
  const winAmount = crypto.randomInt(minWin, maxWin + 1);
  const profit = winAmount - bet;
  const newBalance = user.balance - bet + winAmount;

  db.prepare(`UPDATE users SET balance = ? WHERE telegram_id = ?`).run(newBalance, telegramId);

  return { winAmount, newBalance, profit };
}

// НОВОЕ: Рефералка
export function claimReferral(telegramId: number, referrerId: number) {
  const user = getUserStmt.get(telegramId);
  if (!user || user.referrer_id !== null || telegramId === referrerId) return;
  
  const bonus = 5000;
  db.prepare(`UPDATE users SET referrer_id = ? WHERE telegram_id = ?`).run(referrerId, telegramId);
  db.prepare(`UPDATE users SET balance = balance + ? WHERE telegram_id IN (?, ?)`).run(bonus, telegramId, referrerId);
}

// НОВОЕ: Заявка на вывод
export function requestWithdrawal(telegramId: number, amount: number) {
  const user = getUserStmt.get(telegramId);
  if (!user) throw new GameError('USER_NOT_FOUND', 404);
  if (user.balance < amount) throw new GameError('INSUFFICIENT_FUNDS', 402);
  if (amount < 1000) throw new GameError('MIN_WITHDRAW_1000', 400);

  db.prepare(`UPDATE users SET balance = balance - ? WHERE telegram_id = ?`).run(amount, telegramId);
  db.prepare(`INSERT INTO withdrawals (telegram_id, amount) VALUES (?, ?)`).run(telegramId, amount);
}