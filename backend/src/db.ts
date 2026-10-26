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
  price_coins INTEGER DEFAULT 0,
  price_stars INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'coins',
  animation_url TEXT,
  loot  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS case_openings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER NOT NULL REFERENCES users(telegram_id),
  case_id     INTEGER NOT NULL REFERENCES cases(id),
  price       INTEGER NOT NULL,
  reward      TEXT NOT NULL,
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

// Пересоздаем кейсы
db.exec(`DROP TABLE IF EXISTS case_openings;`);
db.exec(`DROP TABLE IF EXISTS cases;`);

db.exec(`
CREATE TABLE IF NOT EXISTS cases (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  slug  TEXT NOT NULL UNIQUE,
  name  TEXT NOT NULL,
  price_coins INTEGER DEFAULT 0,
  price_stars INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'coins',
  animation_url TEXT,
  loot  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS case_openings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER NOT NULL REFERENCES users(telegram_id),
  case_id     INTEGER NOT NULL REFERENCES cases(id),
  price       INTEGER NOT NULL,
  reward      TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
`);

const seedLoot = [
  {
    slug: 'starter',
    name: 'Starter',
    price_coins: 1000,
    price_stars: 0,
    currency: 'coins',
    animation_url: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-13.json?v=1', // Loot Bag
    loot: [
      { reward: 200, weight: 5000 },
      { reward: 500, weight: 2500 },
      { reward: 1000, weight: 1500 },
      { reward: 2000, weight: 700 },
      { reward: 5000, weight: 250 },
      { reward: 20000, weight: 50 },
    ],
  },
  {
    slug: 'premium',
    name: 'Premium',
    price_coins: 10000,
    price_stars: 0,
    currency: 'coins',
    animation_url: 'https://proxy-cdn.virusgift.pro/heartlocket.json?v=1', // Heart Locket
    loot: [
      { reward: 2000, weight: 5000 },
      { reward: 5000, weight: 3000 },
      { reward: 10000, weight: 1000 },
      { reward: 20000, weight: 700 },
      { reward: 50000, weight: 250 },
      { reward: 500000, weight: 50 },
    ],
  },
  {
    slug: 'heart',
    name: 'Heart',
    price_coins: 0,
    price_stars: 2,
    currency: 'stars',
    animation_url: 'https://proxy-cdn.virusgift.pro/heartlocket.json?v=1',
    loot: [
      { reward: 5000, weight: 5000 },
      { reward: 10000, weight: 2500 },
      { reward: 50000, weight: 1500 },
      { reward: 100000, weight: 700 },
      { reward: 500000, weight: 250 },
      { reward: 2000000, weight: 50 },
    ],
  },
  {
    slug: 'arm',
    name: 'Arm',
    price_coins: 0,
    price_stars: 2,
    currency: 'stars',
    animation_url: 'https://proxy-cdn.virusgift.pro/MightyArm.json?v=1',
    loot: [
      { reward: 5000, weight: 5000 },
      { reward: 10000, weight: 2500 },
      { reward: 50000, weight: 1500 },
      { reward: 100000, weight: 700 },
      { reward: 500000, weight: 250 },
      { reward: 2000000, weight: 50 },
    ],
  },
  {
    slug: 'oscar',
    name: 'Oscar',
    price_coins: 0,
    price_stars: 2.5,
    currency: 'stars',
    animation_url: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-62.json?v=1',
    loot: [
      { reward: 10000, weight: 5000 },
      { reward: 20000, weight: 2500 },
      { reward: 100000, weight: 1500 },
      { reward: 500000, weight: 700 },
      { reward: 1000000, weight: 250 },
      { reward: 5000000, weight: 50 },
    ],
  },
  {
    slug: 'perfume',
    name: 'Perfume',
    price_coins: 0,
    price_stars: 2.5,
    currency: 'stars',
    animation_url: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-64.json?v=1',
    loot: [
      { reward: 10000, weight: 5000 },
      { reward: 20000, weight: 2500 },
      { reward: 100000, weight: 1500 },
      { reward: 500000, weight: 700 },
      { reward: 1000000, weight: 250 },
      { reward: 5000000, weight: 50 },
    ],
  },
  {
    slug: 'movie',
    name: 'Movie',
    price_coins: 0,
    price_stars: 4,
    currency: 'stars',
    animation_url: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-47.json?v=1',
    loot: [
      { reward: 20000, weight: 5000 },
      { reward: 50000, weight: 3000 },
      { reward: 200000, weight: 1000 },
      { reward: 500000, weight: 700 },
      { reward: 2000000, weight: 250 },
      { reward: 10000000, weight: 50 },
    ],
  },
  {
    slug: 'space',
    name: 'Space',
    price_coins: 0,
    price_stars: 6,
    currency: 'stars',
    animation_url: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-45.json?v=1',
    loot: [
      { reward: 30000, weight: 5000 },
      { reward: 100000, weight: 3000 },
      { reward: 500000, weight: 1000 },
      { reward: 1000000, weight: 700 },
      { reward: 5000000, weight: 250 },
      { reward: 20000000, weight: 50 },
    ],
  },
  {
    slug: 'telegram',
    name: 'Telegram',
    price_coins: 0,
    price_stars: 5,
    currency: 'stars',
    animation_url: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-76.json?v=1',
    loot: [
      { reward: 25000, weight: 5000 },
      { reward: 100000, weight: 3000 },
      { reward: 500000, weight: 1000 },
      { reward: 2000000, weight: 700 },
      { reward: 10000000, weight: 250 },
      { reward: 50000000, weight: 50 },
    ],
  },
  {
    slug: '18_plus',
    name: '18+',
    price_coins: 0,
    price_stars: 7,
    currency: 'stars',
    animation_url: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-58.json?v=1',
    loot: [
      { reward: 50000, weight: 5000 },
      { reward: 200000, weight: 3000 },
      { reward: 1000000, weight: 1000 },
      { reward: 5000000, weight: 700 },
      { reward: 10000000, weight: 250 },
      { reward: 50000000, weight: 50 },
    ],
  },
  {
    slug: 'money',
    name: 'Money',
    price_coins: 0,
    price_stars: 8,
    currency: 'stars',
    animation_url: 'https://proxy-cdn.virusgift.pro/moneypot.json?v=1',
    loot: [
      { reward: 50000, weight: 5000 },
      { reward: 500000, weight: 3000 },
      { reward: 2000000, weight: 1000 },
      { reward: 5000000, weight: 700 },
      { reward: 20000000, weight: 250 },
      { reward: 100000000, weight: 50 },
    ],
  },
  {
    slug: 'pepe',
    name: 'Pepe',
    price_coins: 0,
    price_stars: 15,
    currency: 'stars',
    animation_url: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-57.json?v=1',
    loot: [
      { reward: 100000, weight: 5000 },
      { reward: 1000000, weight: 3000 },
      { reward: 5000000, weight: 1000 },
      { reward: 20000000, weight: 700 },
      { reward: 100000000, weight: 250 },
      { reward: 500000000, weight: 50 },
    ],
  },
];

for (const c of seedLoot) {
  db.prepare(
    `INSERT INTO cases (slug, name, price_coins, price_stars, currency, animation_url, loot) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(c.slug, c.name, c.price_coins, c.price_stars, c.currency, c.animation_url, JSON.stringify(c.loot));
}

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
interface CaseRow { id: number; slug: string; name: string; price_coins: number; price_stars: number; currency: string; animation_url: string; loot: string; }
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
  const rows = db.prepare<[], CaseRow>(`SELECT * FROM cases ORDER BY price_coins ASC, price_stars ASC`).all();
  return rows.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    price_coins: c.price_coins,
    price_stars: c.price_stars,
    currency: c.currency,
    animation_url: c.animation_url,
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

  if (c.currency === 'stars') throw new GameError('STARS_NOT_SUPPORTED_YET', 400);

  const user = getUserStmt.get(telegramId);
  if (!user) throw new GameError('USER_NOT_FOUND', 404);
  if (user.balance < c.price_coins) throw new GameError('INSUFFICIENT_FUNDS', 402);

  const reward = rollLoot(JSON.parse(c.loot) as LootItem[]);

  db.prepare(`UPDATE users SET balance = balance - ? + ? WHERE telegram_id = ?`)
    .run(c.price_coins, reward, telegramId);
  db.prepare(
    `INSERT INTO case_openings (telegram_id, case_id, price, reward, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(telegramId, c.id, c.price_coins, String(reward), Date.now());

  return { reward, price: c.price_coins, balance: getUserStmt.get(telegramId)!.balance };
});

export function spinWheel(telegramId: number) {
  const user = getUserStmt.get(telegramId);
  if (!user) throw new GameError('USER_NOT_FOUND', 404);

  const now = Date.now();
  const cooldown = 10 * 1000;

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

export function claimReferral(telegramId: number, referrerId: number) {
  const user = getUserStmt.get(telegramId);
  if (!user || user.referrer_id !== null || telegramId === referrerId) return;
  
  const bonus = 5000;
  db.prepare(`UPDATE users SET referrer_id = ? WHERE telegram_id = ?`).run(referrerId, telegramId);
  db.prepare(`UPDATE users SET balance = balance + ? WHERE telegram_id IN (?, ?)`).run(bonus, telegramId, referrerId);
}

export function requestWithdrawal(telegramId: number, amount: number) {
  const user = getUserStmt.get(telegramId);
  if (!user) throw new GameError('USER_NOT_FOUND', 404);
  if (user.balance < amount) throw new GameError('INSUFFICIENT_FUNDS', 402);
  if (amount < 1000) throw new GameError('MIN_WITHDRAW_1000', 400);

  db.prepare(`UPDATE users SET balance = balance - ? WHERE telegram_id = ?`).run(amount, telegramId);
  db.prepare(`INSERT INTO withdrawals (telegram_id, amount) VALUES (?, ?)`).run(telegramId, amount);
}