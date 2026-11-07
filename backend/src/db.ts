import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { GIFTS } from './catalog.js';
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

CREATE TABLE IF NOT EXISTS withdrawals (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER NOT NULL REFERENCES users(telegram_id),
  amount      INTEGER NOT NULL,
  status      TEXT DEFAULT 'pending',
  created_at  INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS referral_claims (
  telegram_id INTEGER NOT NULL,
  milestone   INTEGER NOT NULL,
  claimed_at  INTEGER NOT NULL,
  PRIMARY KEY (telegram_id, milestone)
);
`);

// Preserve existing cases and opening history on restart.


db.exec(`
CREATE TABLE IF NOT EXISTS cases (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  slug  TEXT NOT NULL UNIQUE,
  name  TEXT NOT NULL,
  price_coins INTEGER DEFAULT 0,
  price_stars INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'coins',
  image_url TEXT,
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
    slug: 'bomzh',
    name: 'Бомж Стайл',
    price_coins: 1000,
    price_stars: 0,
    currency: 'coins',
    image_url: '/cases/bomzh.png',
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
    slug: 'space',
    name: 'Space',
    price_coins: 0,
    price_stars: 6,
    currency: 'stars',
    image_url: '/cases/space.png',
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
    slug: 'rich',
    name: 'Rich Life',
    price_coins: 0,
    price_stars: 8,
    currency: 'stars',
    image_url: '/cases/rich.png',
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
    slug: '18_plus',
    name: '18+',
    price_coins: 0,
    price_stars: 7,
    currency: 'stars',
    image_url: '/cases/18plus.png',
    loot: [
      { reward: 50000, weight: 5000 },
      { reward: 200000, weight: 3000 },
      { reward: 1000000, weight: 1000 },
      { reward: 5000000, weight: 700 },
      { reward: 10000000, weight: 250 },
      { reward: 50000000, weight: 50 },
    ],
  },
];

for (const c of seedLoot) {
  db.prepare(
    `INSERT INTO cases (slug, name, price_coins, price_stars, currency, image_url, loot) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(slug) DO NOTHING`
  ).run(c.slug, c.name, c.price_coins, c.price_stars, c.currency, c.image_url, JSON.stringify(c.loot));
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
interface CaseRow { id: number; slug: string; name: string; price_coins: number; price_stars: number; currency: string; image_url: string; loot: string; }
interface LootItem { reward: number; weight: number }

export class GameError extends Error {
  constructor(public code: string, public status = 400) {
    super(code);
  }
}

// РУБЕЖИ РЕФЕРАЛЬНОЙ ПРОГРАММЫ
const REFERRAL_MILESTONES = [
  { count: 5, reward: 10000 },
  { count: 10, reward: 25000 },
  { count: 15, reward: 50000 },
  { count: 20, reward: 100000 },
  { count: 50, reward: 300000 },
  { count: 100, reward: 1000000 },
];

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
    image_url: c.image_url,
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
  assertAmount(caseId);
  const c = db.prepare<[number], CaseRow>(`SELECT * FROM cases WHERE id = ?`).get(caseId);
  if (!c) throw new GameError('CASE_NOT_FOUND', 404);



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
  const cooldown = 24 * 60 * 60 * 1000;

  if (now - user.last_wheel_spin < cooldown) {
    throw new GameError('WHEEL_COOLDOWN', 429);
  }

  const rewards = [50, 100, 200, 500, 1000, 5000];
  const reward = rewards[crypto.randomInt(rewards.length)];

  db.prepare(`UPDATE users SET balance = balance + ?, last_wheel_spin = ? WHERE telegram_id = ?`)
    .run(reward, now, telegramId);

  return { reward, balance: getUserStmt.get(telegramId)!.balance };
}

export const standardUpgrade = db.transaction((telegramId: number, bet: number, giftId: string) => {
  assertAmount(bet);
  const gift = GIFTS.find(g => String(g.id) === giftId);
  if (!gift) throw new GameError('GIFT_NOT_FOUND', 404);
  const price = getGiftPrice(giftId);
  if (bet >= price) throw new GameError('BAD_AMOUNT');
  const user = getUserStmt.get(telegramId);
  if (!user) throw new GameError('USER_NOT_FOUND', 404);
  if (user.balance < bet) throw new GameError('INSUFFICIENT_FUNDS', 402);
  const chance = Math.min(0.95, bet / price);
  const win = crypto.randomInt(1_000_000) < Math.floor(chance * 1_000_000);
  db.prepare('UPDATE users SET balance = balance - ? WHERE telegram_id = ?').run(bet, telegramId);
  let cardId: number | null = null;
  if (win) cardId = Number(db.prepare('INSERT INTO collection_cards(telegram_id,gift_id,created_at) VALUES(?,?,?)').run(telegramId, giftId, Date.now()).lastInsertRowid);
  return { win, newBalance: getUserStmt.get(telegramId)!.balance, bet, target: price, chancePercent: Math.floor(chance * 100), cardId };
});

export function mysteryUpgrade(telegramId: number, bet: number) {
  const user = getUserStmt.get(telegramId);
  if (!user) throw new GameError('USER_NOT_FOUND', 404);
  if (user.balance < bet) throw new GameError('INSUFFICIENT_FUNDS', 402);
  if (bet <= 0) throw new GameError('BAD_AMOUNT', 400);

  assertAmount(bet);
  const minWin = Math.floor(bet / 10);
  const maxWin = Math.floor(bet * 10);
  const winAmount = crypto.randomInt(minWin, maxWin + 1);
  const profit = winAmount - bet;
  const newBalance = user.balance - bet + winAmount;

  db.prepare(`UPDATE users SET balance = ? WHERE telegram_id = ?`).run(newBalance, telegramId);

  return { winAmount, newBalance, profit };
}

// РЕФЕРАЛКА: приветственный бонус новому игроку
export function claimReferral(telegramId: number, referrerId: number) {
  const user = getUserStmt.get(telegramId);
  if (!user || user.referrer_id !== null || telegramId === referrerId) return;
  
  const welcomeBonus = 1000;
  db.prepare(`UPDATE users SET referrer_id = ? WHERE telegram_id = ?`).run(referrerId, telegramId);
  db.prepare(`UPDATE users SET balance = balance + ? WHERE telegram_id = ?`).run(welcomeBonus, telegramId);
}

// РЕФЕРАЛКА: статистика и рубежи
export function getReferralStats(telegramId: number) {
  const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM users WHERE referrer_id = ?`).get(telegramId) as { cnt: number };
  const claims = db.prepare(`SELECT milestone FROM referral_claims WHERE telegram_id = ?`).all(telegramId) as { milestone: number }[];
  const claimedSet = new Set(claims.map(c => c.milestone));
  
  return {
    count: countRow.cnt,
    milestones: REFERRAL_MILESTONES.map(m => ({
      count: m.count,
      reward: m.reward,
      claimed: claimedSet.has(m.count),
      available: countRow.cnt >= m.count && !claimedSet.has(m.count),
    }))
  };
}

// РЕФЕРАЛКА: забрать награду за рубеж
export function claimReferralMilestone(telegramId: number, milestone: number) {
  const m = REFERRAL_MILESTONES.find(x => x.count === milestone);
  if (!m) throw new GameError('INVALID_MILESTONE', 400);
  
  const user = getUserStmt.get(telegramId);
  if (!user) throw new GameError('USER_NOT_FOUND', 404);
  
  const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM users WHERE referrer_id = ?`).get(telegramId) as { cnt: number };
  if (countRow.cnt < milestone) throw new GameError('NOT_ENOUGH_REFERRALS', 400);
  
  const existing = db.prepare(`SELECT 1 FROM referral_claims WHERE telegram_id = ? AND milestone = ?`).get(telegramId, milestone);
  if (existing) throw new GameError('ALREADY_CLAIMED', 400);
  
  db.prepare(`INSERT INTO referral_claims (telegram_id, milestone, claimed_at) VALUES (?, ?, ?)`).run(telegramId, milestone, Date.now());
  db.prepare(`UPDATE users SET balance = balance + ? WHERE telegram_id = ?`).run(m.reward, telegramId);
  
  return { success: true, reward: m.reward, newBalance: getUserStmt.get(telegramId)!.balance };
}

// Collection edition: all costs are earned game points, never Telegram Stars.
db.exec(`
CREATE TABLE IF NOT EXISTS collection_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER NOT NULL REFERENCES users(telegram_id),
  gift_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS collection_owner ON collection_cards(telegram_id);
CREATE TABLE IF NOT EXISTS gift_prices (
  gift_id TEXT PRIMARY KEY,
  price INTEGER NOT NULL CHECK(price > 0),
  source TEXT NOT NULL,
  updated_at INTEGER
);
`);
db.transaction(() => {
  for (const gift of GIFTS) db.prepare("INSERT INTO gift_prices(gift_id,price,source) VALUES(?,?,'reference') ON CONFLICT(gift_id) DO NOTHING").run(String(gift.id), gift.stars);
  db.prepare("UPDATE cases SET currency='coins', price_coins=CASE WHEN price_coins > 0 THEN price_coins ELSE price_stars * 1000 END, price_stars=0 WHERE currency='stars'").run();
})();

export function assertAmount(value: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 100_000_000) throw new GameError('BAD_AMOUNT');
}
export function getGiftPrice(giftId: string): number {
  const row = db.prepare('SELECT price FROM gift_prices WHERE gift_id=?').get(giftId) as { price: number } | undefined;
  if (!row) throw new GameError('GIFT_NOT_FOUND', 404);
  return row.price;
}
export function getCollection(telegramId: number) {
  return db.prepare('SELECT id, gift_id AS giftId, created_at AS createdAt FROM collection_cards WHERE telegram_id=? ORDER BY id DESC').all(telegramId);
}
export const sellCard = db.transaction((telegramId: number, cardId: number) => {
  assertAmount(cardId);
  const card = db.prepare('SELECT gift_id FROM collection_cards WHERE id=? AND telegram_id=?').get(cardId, telegramId) as {gift_id: string} | undefined;
  if (!card) throw new GameError('CARD_NOT_FOUND', 404);
  const price = getGiftPrice(card.gift_id);
  const changed = db.prepare('UPDATE users SET balance=balance+? WHERE telegram_id=? AND balance <= ?').run(price, telegramId, Number.MAX_SAFE_INTEGER - price);
  if (!changed.changes) throw new GameError('BALANCE_LIMIT');
  db.prepare('DELETE FROM collection_cards WHERE id=? AND telegram_id=?').run(cardId, telegramId);
  return { success: true, price, balance: getUserStmt.get(telegramId)!.balance };
});

export const upgradeCard = db.transaction((telegramId: number, cardId: number, targetGiftId: string) => {
  assertAmount(cardId);
  const owned = db.prepare('SELECT gift_id FROM collection_cards WHERE id=? AND telegram_id=?').get(cardId, telegramId) as {gift_id: string} | undefined;
  if (!owned) throw new GameError('CARD_NOT_FOUND', 404);
  const stake = getGiftPrice(owned.gift_id);
  const target = getGiftPrice(targetGiftId);
  if (target <= stake) throw new GameError('BAD_AMOUNT');
  const chance = Math.min(0.95, stake / target);
  const win = crypto.randomInt(1_000_000) < Math.floor(chance * 1_000_000);
  db.prepare('DELETE FROM collection_cards WHERE id=? AND telegram_id=?').run(cardId, telegramId);
  let newCardId: number | null = null;
  if (win) newCardId = Number(db.prepare('INSERT INTO collection_cards(telegram_id,gift_id,created_at) VALUES(?,?,?)').run(telegramId, targetGiftId, Date.now()).lastInsertRowid);
  return {win, chancePercent: Math.floor(chance * 100), cardId: newCardId};
});
