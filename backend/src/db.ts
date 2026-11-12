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
      { reward: 2400, weight: 5000 },
      { reward: 4800, weight: 3000 },
      { reward: 9000, weight: 1000 },
      { reward: 15000, weight: 700 },
      { reward: 24000, weight: 250 },
      { reward: 48000, weight: 50 },
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
      { reward: 3200, weight: 5000 },
      { reward: 6400, weight: 3000 },
      { reward: 12000, weight: 1000 },
      { reward: 20000, weight: 700 },
      { reward: 32000, weight: 250 },
      { reward: 64000, weight: 50 },
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
      { reward: 2800, weight: 5000 },
      { reward: 5600, weight: 3000 },
      { reward: 10500, weight: 1000 },
      { reward: 17500, weight: 700 },
      { reward: 28000, weight: 250 },
      { reward: 56000, weight: 50 },
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

export const upsertUser = db.transaction((u: TgUser): UserRow => {
  const isNew = !getUserStmt.get(u.id);
  upsertStmt.run({id: u.id, username: u.username ?? null, first_name: u.first_name, now: Date.now()});
  const referrer = u.referrerId;
  if (isNew && referrer && referrer !== u.id && getUserStmt.get(referrer)) {
    db.prepare('UPDATE users SET referrer_id=? WHERE telegram_id=?').run(referrer, u.id);
  }
  return getUserStmt.get(u.id)!;
}).immediate;

const giftCases = [
  {slug:'starter-gifts', name:'Первый дроп', theme:'starter', price:650, gifts:['59','199','200','143']},
  {slug:'halloween-gifts', name:'Хэллоуин', theme:'halloween', price:1550, gifts:['79','71','48','60']},
  {slug:'cosmic-gifts', name:'Космос', theme:'cosmic', price:3500, gifts:['143','145','40','150']},
  {slug:'premium-gifts', name:'Витрина люкс', theme:'premium', price:14500, gifts:['62','64','40','150']},
];
giftCases.push(
  {slug:'sweet-gifts', name:'Сладкий стол', theme:'sweet', price:690, gifts:['133','44','155','159']},
  {slug:'winter-gifts', name:'Зимняя сказка', theme:'winter', price:950, gifts:['36','73','39','56']},
  {slug:'love-gifts', name:'Секрет сердца', theme:'love', price:1450, gifts:['44','58','21','78']},
  {slug:'magic-gifts', name:'Лавка магии', theme:'magic', price:1900, gifts:['51','45','61','37']},
);
const giftCaseWeights = [65,25,9,1];
const saveCase = db.prepare('INSERT OR IGNORE INTO cases(slug,name,price_coins,image_url,loot) VALUES(?,?,?,?,?)');
for (const item of giftCases) saveCase.run(item.slug,item.name,item.price,'', '[]');

export function listCases() {
  return giftCases.map(item => {
    const row = db.prepare<[string], CaseRow>('SELECT * FROM cases WHERE slug=?').get(item.slug)!;
    return {id:row.id, name:item.name, theme:item.theme, price_coins:item.price, giftIds:item.gifts};
  });
}

db.exec(`
  CREATE TABLE IF NOT EXISTS clicker_progress (
    telegram_id INTEGER PRIMARY KEY REFERENCES users(telegram_id),
    power INTEGER NOT NULL DEFAULT 0,
    bears INTEGER NOT NULL DEFAULT 0,
    bear_since INTEGER NOT NULL DEFAULT 0,
    tap_credit REAL NOT NULL DEFAULT 12,
    tap_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS rocket_flights (
    telegram_id INTEGER PRIMARY KEY REFERENCES users(telegram_id),
    launched INTEGER NOT NULL,
    crash_ms INTEGER NOT NULL,
    stake INTEGER NOT NULL,
    payout INTEGER,
    cashout_multiplier REAL
  );
`);

const clickerRow = db.prepare('SELECT * FROM clicker_progress WHERE telegram_id=?');
function ensureClicker(id: number) {
  db.prepare('INSERT OR IGNORE INTO clicker_progress(telegram_id) VALUES(?)').run(id);
  return clickerRow.get(id) as {power:number; bears:number; bear_since:number; tap_credit:number; tap_at:number};
}
const bearInterval = 15 * 60_000;
export function getClicker(id: number, base: number) {
  const row = ensureClicker(id);
  const intervals = Math.max(0, Math.min(32, Math.floor((Date.now() - row.bear_since) / bearInterval)));
  return {
    perTap:base + row.power, bears:row.bears, offlineReward:intervals * row.bears * 30,
    powerPrice:row.power < 20 ? 100 * (row.power + 1) ** 2 : null,
    bearPrice:row.bears < 5 ? 500 * (row.bears + 1) : null,
  };
}

export const registerClick = db.transaction((id: number, base: number, count: number) => {
  const row = ensureClicker(id);
  const now = Date.now();
  const available = Math.min(12, row.tap_credit + Math.max(0, now - row.tap_at) * 0.012);
  const accepted = Math.min(count, Math.floor(available));
  if (!accepted) throw new GameError('TOO_FAST', 429);
  const user = getUserStmt.get(id)!;
  const earned = (base + row.power) * accepted;
  if (user.balance > Number.MAX_SAFE_INTEGER - earned) throw new GameError('BALANCE_LIMIT');
  db.prepare('UPDATE clicker_progress SET tap_credit=?,tap_at=? WHERE telegram_id=?').run(available-accepted,now,id);
  db.prepare('UPDATE users SET balance=balance+?, total_clicks=total_clicks+?, last_click_ms=? WHERE telegram_id=?')
    .run(earned,accepted,now,id);
  return {balance:user.balance+earned,totalClicks:user.total_clicks+accepted,earned,accepted};
}).immediate;

export const improveClicker = db.transaction((id: number, action: 'power'|'bear'|'collect', base: number) => {
  const info = getClicker(id,base);
  const user = getUserStmt.get(id)!;
  const price = action === 'power' ? info.powerPrice : action === 'bear' ? info.bearPrice : 0;
  if (price === null) throw new GameError('UPGRADE_LIMIT');
  if (user.balance < price) throw new GameError('INSUFFICIENT_FUNDS',402);
  const reward = action === 'power' ? 0 : info.offlineReward;
  if (action === 'collect' && !reward) throw new GameError('NO_OFFLINE_REWARD');
  if (!Number.isSafeInteger(user.balance - price + reward)) throw new GameError('BALANCE_LIMIT');
  if (action === 'power') db.prepare('UPDATE clicker_progress SET power=power+1 WHERE telegram_id=?').run(id);
  else if (action === 'bear') db.prepare('UPDATE clicker_progress SET bears=bears+1,bear_since=? WHERE telegram_id=?').run(Date.now(),id);
  else {
    const row = ensureClicker(id);
    const elapsed = Date.now() - row.bear_since;
    const next = elapsed >= 32 * bearInterval ? Date.now() : row.bear_since + Math.floor(elapsed / bearInterval) * bearInterval;
    db.prepare('UPDATE clicker_progress SET bear_since=? WHERE telegram_id=?').run(next,id);
  }
  db.prepare('UPDATE users SET balance=balance-?+? WHERE telegram_id=?').run(price,reward,id);
  return {reward};
}).immediate;

db.exec(`CREATE TABLE IF NOT EXISTS rocket_rounds (
  launched INTEGER PRIMARY KEY,
  crash_ms INTEGER NOT NULL
)`);
if (!(db.pragma('table_info(rocket_flights)') as {name:string}[]).some(column => column.name === 'auto_x')) {
  db.exec('ALTER TABLE rocket_flights ADD COLUMN auto_x REAL');
}

const rocketPeriod = 25_000;
const rocketGrowth = 5000;
if (!(db.pragma('table_info(rocket_flights)') as {name:string}[]).some(column => column.name === 'growth_ms')) {
  db.exec('ALTER TABLE rocket_flights ADD COLUMN growth_ms INTEGER NOT NULL DEFAULT 2500');
}
const flightRow = db.prepare('SELECT * FROM rocket_flights WHERE telegram_id=?');
function flight(id: number) {
  return flightRow.get(id) as {launched:number; crash_ms:number; stake:number; payout:number|null; cashout_multiplier:number|null; auto_x:number|null; growth_ms:number} | undefined;
}
const multiplierAt = (elapsed: number, growth = rocketGrowth) => Math.floor(Math.exp(Math.max(0,elapsed) / growth) * 100) / 100;
function roundCrash(launched: number) {
  const existing = db.prepare('SELECT crash_ms FROM rocket_rounds WHERE launched=?').get(launched) as {crash_ms:number}|undefined;
  if (existing) return existing.crash_ms;
  const factor = Math.max(1, 0.94 / ((crypto.randomInt(1_000_000) + 1) / 1_000_000));
  const crash = Math.min(15000, Math.floor(rocketGrowth * Math.log(factor)));
  db.prepare('INSERT OR IGNORE INTO rocket_rounds VALUES (?,?)').run(launched,crash);
  return (db.prepare('SELECT crash_ms FROM rocket_rounds WHERE launched=?').get(launched) as {crash_ms:number}).crash_ms;
}
function payRocket(id: number, stake: number, multiplier: number) {
  const payout = Math.floor(stake * multiplier);
  const user = getUserStmt.get(id)!;
  if (!Number.isSafeInteger(user.balance + payout)) throw new GameError('BALANCE_LIMIT');
  db.prepare('UPDATE users SET balance=balance+? WHERE telegram_id=?').run(payout,id);
  db.prepare('UPDATE rocket_flights SET payout=?,cashout_multiplier=? WHERE telegram_id=?').run(payout,multiplier,id);
}
function settleAuto(id: number, now: number) {
  const row = flight(id);
  if (!row || row.payout !== null || row.auto_x === null) return;
  const threshold = Math.ceil(row.growth_ms * Math.log(row.auto_x));
  if (threshold < row.crash_ms && now >= row.launched + threshold) payRocket(id,row.stake,row.auto_x);
}

export const getRocket = db.transaction((id: number) => {
  const now = Date.now();
  settleAuto(id,now);
  const launched = Math.floor(now / rocketPeriod) * rocketPeriod;
  const crash = roundCrash(launched);
  const elapsed = now - launched;
  const row = flight(id);
  return {
    launched, now, nextLaunch:launched + rocketPeriod, growthMs:rocketGrowth,
    history:(db.prepare('SELECT crash_ms FROM rocket_rounds WHERE launched < ? AND launched % ? = 0 ORDER BY launched DESC LIMIT 20').all(launched,rocketPeriod) as {crash_ms:number}[]).map(round=>multiplierAt(round.crash_ms)),
    entries:db.prepare(`SELECT COALESCE(u.first_name,'Игрок') AS name, f.stake
      FROM rocket_flights f JOIN users u USING(telegram_id) WHERE f.launched=? ORDER BY f.telegram_id`).all(launched+rocketPeriod),
    phase:elapsed < crash ? 'flying' : 'crashed',
    multiplier:multiplierAt(Math.min(crash,elapsed)),
    bet:row ? {
      launched:row.launched, stake:row.stake, payout:row.payout, autoX:row.auto_x,
      status:row.payout !== null ? 'cashed' : now < row.launched ? 'queued' : now >= row.launched + row.crash_ms ? 'crashed' : 'flying',
    } : null,
  };
}).immediate;

export const launchRocket = db.transaction((id: number, cardId: number|undefined, autoX: number|null = null, coins?:number) => {
  const state = getRocket(id);
  if (state.bet?.status === 'queued' || state.bet?.status === 'flying') throw new GameError('ROCKET_ACTIVE');
  if ((cardId === undefined) === (coins === undefined)) throw new GameError('BAD_AMOUNT');
  let stake: number;
  if (cardId !== undefined) {
    const card = db.prepare('SELECT gift_id FROM collection_cards WHERE id=? AND telegram_id=?').get(cardId,id) as {gift_id:string}|undefined;
    if (!card) throw new GameError('CARD_NOT_FOUND',404);
    stake = getGiftPrice(card.gift_id);
    db.prepare('DELETE FROM collection_cards WHERE id=? AND telegram_id=?').run(cardId,id);
  } else {
    stake = coins!;
    assertAmount(stake);
    if (!db.prepare('UPDATE users SET balance=balance-? WHERE telegram_id=? AND balance>=?').run(stake,id,stake).changes) {
      throw new GameError('INSUFFICIENT_FUNDS',402);
    }
  }
  const crash = roundCrash(state.nextLaunch);
  db.prepare(`INSERT INTO rocket_flights(telegram_id,launched,crash_ms,stake,payout,cashout_multiplier,auto_x,growth_ms)
    VALUES (?,?,?,?,NULL,NULL,?,?) ON CONFLICT(telegram_id) DO UPDATE SET launched=excluded.launched,
    crash_ms=excluded.crash_ms,stake=excluded.stake,payout=NULL,cashout_multiplier=NULL,auto_x=excluded.auto_x,growth_ms=excluded.growth_ms`)
    .run(id,state.nextLaunch,crash,stake,autoX,rocketGrowth);
  return getRocket(id);
}).immediate;

export const cashRocket = db.transaction((id: number, launched: number) => {
  const now = Date.now();
  settleAuto(id,now);
  const row = flight(id);
  if (row && row.launched === launched && row.payout === null && now >= launched && now < launched + row.crash_ms) {
    payRocket(id,row.stake,multiplierAt(now-launched,row.growth_ms));
  }
  return getRocket(id);
}).immediate;

export function settleRocketAutos() {
  const now = Date.now();
  const users = db.prepare('SELECT telegram_id FROM rocket_flights WHERE auto_x IS NOT NULL AND payout IS NULL AND launched <= ?').all(now) as {telegram_id:number}[];
  for (const user of users) db.transaction(settleAuto).immediate(user.telegram_id,now);
  db.prepare('DELETE FROM rocket_rounds WHERE launched < ?').run(now - 30 * 86400_000);
}

export const openCase = db.transaction((telegramId: number, caseId: number) => {
  assertAmount(caseId);
  const item = listCases().find(entry => entry.id === caseId);
  if (!item) throw new GameError('CASE_NOT_FOUND', 404);
  const user = getUserStmt.get(telegramId);
  if (!user) throw new GameError('USER_NOT_FOUND', 404);
  if (user.balance < item.price_coins) throw new GameError('INSUFFICIENT_FUNDS', 402);

  const roll = crypto.randomInt(100);
  let cumulative = 0;
  const index = giftCaseWeights.findIndex(weight => roll < (cumulative += weight));
  const giftId = item.giftIds[index];
  const now = Date.now();
  db.prepare('UPDATE users SET balance=balance-? WHERE telegram_id=?').run(item.price_coins, telegramId);
  const cardId = Number(db.prepare('INSERT INTO collection_cards(telegram_id,gift_id,created_at) VALUES(?,?,?)')
    .run(telegramId, giftId, now).lastInsertRowid);
  db.prepare('INSERT INTO case_openings(telegram_id,case_id,price,reward,created_at) VALUES(?,?,?,?,?)')
    .run(telegramId, caseId, item.price_coins, 'gift:' + giftId, now);
  return {giftId, cardId, balance:user.balance - item.price_coins};
}).immediate;

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
  const winningTickets = Math.floor(chance * 1_000_000);
  const win = crypto.randomInt(1_000_000) < winningTickets;
  db.prepare('UPDATE users SET balance = balance - ? WHERE telegram_id = ?').run(bet, telegramId);
  let cardId: number | null = null;
  if (win) cardId = Number(db.prepare('INSERT INTO collection_cards(telegram_id,gift_id,created_at) VALUES(?,?,?)').run(telegramId, giftId, Date.now()).lastInsertRowid);
  return { win, newBalance: getUserStmt.get(telegramId)!.balance, bet, target: price, chancePercent: winningTickets / 10_000, cardId };
});

export const mysteryUpgrade = db.transaction((telegramId: number, bet: number) => {
  const user = getUserStmt.get(telegramId);
  if (!user) throw new GameError('USER_NOT_FOUND', 404);
  if (user.balance < bet) throw new GameError('INSUFFICIENT_FUNDS', 402);
  if (bet <= 0) throw new GameError('BAD_AMOUNT', 400);

  assertAmount(bet);
  const roll = crypto.randomInt(1000);
  const min = Math.ceil(bet / 10);
  const tier = roll < 900 ? [min, bet] : roll < 999 ? [bet + 1, bet * 3] : [bet * 3 + 1, bet * 10];
  const winAmount = crypto.randomInt(tier[0], tier[1] + 1);
  const profit = winAmount - bet;
  const newBalance = user.balance + profit;
  if (!Number.isSafeInteger(newBalance)) throw new GameError('BALANCE_LIMIT');
  db.prepare('UPDATE users SET balance=? WHERE telegram_id=?').run(newBalance, telegramId);
  return {winAmount, newBalance, profit};
}).immediate;

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
export const claimReferralMilestone = db.transaction((telegramId: number, milestone: number) => {
  const m = REFERRAL_MILESTONES.find(x => x.count === milestone);
  if (!m) throw new GameError('INVALID_MILESTONE', 400);
  
  const user = getUserStmt.get(telegramId);
  if (!user) throw new GameError('USER_NOT_FOUND', 404);
  
  const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM users WHERE referrer_id = ?`).get(telegramId) as { cnt: number };
  if (countRow.cnt < milestone) throw new GameError('NOT_ENOUGH_REFERRALS', 400);
  
  const existing = db.prepare(`SELECT 1 FROM referral_claims WHERE telegram_id = ? AND milestone = ?`).get(telegramId, milestone);
  if (existing) throw new GameError('ALREADY_CLAIMED', 400);
  
  if (user.balance > Number.MAX_SAFE_INTEGER - m.reward) throw new GameError('BALANCE_LIMIT');
  db.prepare(`INSERT INTO referral_claims (telegram_id, milestone, claimed_at) VALUES (?, ?, ?)`).run(telegramId, milestone, Date.now());
  db.prepare(`UPDATE users SET balance = balance + ? WHERE telegram_id = ?`).run(m.reward, telegramId);
  
  return { success: true, reward: m.reward, newBalance: getUserStmt.get(telegramId)!.balance };
}).immediate;

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
  const winningTickets = Math.floor(chance * 1_000_000);
  const win = crypto.randomInt(1_000_000) < winningTickets;
  db.prepare('DELETE FROM collection_cards WHERE id=? AND telegram_id=?').run(cardId, telegramId);
  let newCardId: number | null = null;
  if (win) newCardId = Number(db.prepare('INSERT INTO collection_cards(telegram_id,gift_id,created_at) VALUES(?,?,?)').run(telegramId, targetGiftId, Date.now()).lastInsertRowid);
  return {win, chancePercent: winningTickets / 10_000, cardId: newCardId};
});


// Set membership is fixed so existing completion rewards keep their meaning.
const collectionSets = [
  ["164", "214", "3", "65", "68", "150"],
  ["149", "13", "40", "105", "130", "64"],
  ["62", "53", "148", "108", "129", "77"],
  ["61", "69", "57", "101", "20", "27"],
  ["23", "49", "1", "70", "5", "196"],
  ["37", "47", "162", "172", "137", "153"],
  ["215", "78", "178", "128", "21", "146"],
  ["60", "48", "45", "66", "71", "136"],
  ["58", "26", "56", "22", "50", "42"],
  ["208", "72", "43", "135", "54", "24"],
  ["144", "109", "206", "145", "147", "134"],
  ["79", "46", "11", "158", "75", "165"],
  ["125", "39", "156", "73", "143", "67"],
  ["126", "52", "107", "207", "163", "112"],
  ["81", "155", "152", "41", "51", "44"],
  ["195", "213", "76", "63", "201", "151"],
  ["74", "198", "35", "4", "154", "87"],
  ["38", "28", "55", "103", "122", "36"],
  ["133", "25", "202", "157", "102", "106"],
  ["104", "159", "200", "199", "59"],
];
const collectionBonus = 1000;

db.exec(`
  CREATE TABLE IF NOT EXISTS collection_discoveries (
    telegram_id INTEGER NOT NULL REFERENCES users(telegram_id),
    gift_id TEXT NOT NULL,
    PRIMARY KEY (telegram_id, gift_id)
  );
  CREATE TABLE IF NOT EXISTS collection_set_rewards (
    telegram_id INTEGER NOT NULL REFERENCES users(telegram_id),
    set_id INTEGER NOT NULL,
    PRIMARY KEY (telegram_id, set_id)
  );
  CREATE TRIGGER IF NOT EXISTS remember_collection_card
  AFTER INSERT ON collection_cards BEGIN
    INSERT OR IGNORE INTO collection_discoveries VALUES (NEW.telegram_id, NEW.gift_id);
  END;
  INSERT OR IGNORE INTO collection_discoveries SELECT telegram_id, gift_id FROM collection_cards;
`);

const updateCaseLoot = db.prepare('UPDATE cases SET loot = ? WHERE slug = ? AND loot <> ?');
for (const item of seedLoot.filter(item => ['space', 'rich', '18_plus'].includes(item.slug))) {
  const loot = JSON.stringify(item.loot);
  updateCaseLoot.run(loot, item.slug, loot);
}

export const getCollectionProgress = db.transaction((telegramId: number) => {
  const discoveries = db.prepare('SELECT gift_id FROM collection_discoveries WHERE telegram_id = ?')
    .all(telegramId) as {gift_id: string}[];
  const unlocked = new Set(discoveries.map(item => item.gift_id));
  const claim = db.prepare('INSERT OR IGNORE INTO collection_set_rewards VALUES (?, ?)');
  let bonus = 0;
  const sets = collectionSets.map((giftIds, index) => {
    const complete = giftIds.every(id => unlocked.has(id));
    if (complete && claim.run(telegramId, index + 1).changes) bonus += collectionBonus;
    return {id: index + 1, giftIds, complete, bonus: collectionBonus};
  });
  if (bonus) db.prepare('UPDATE users SET balance = balance + ? WHERE telegram_id = ?').run(bonus, telegramId);
  return {sets, unlocked: [...unlocked], bonus};
});

const playerQuests = [
  {id:1, title:'Сделай 100 тапов', reward:100, target:100},
  {id:2, title:'Открой первый кейс', reward:150, target:1},
  {id:3, title:'Открой 5 разных карточек', reward:300, target:5},
];

db.exec(`CREATE TABLE IF NOT EXISTS player_quest_claims (
  telegram_id INTEGER NOT NULL REFERENCES users(telegram_id),
  quest_id INTEGER NOT NULL,
  PRIMARY KEY (telegram_id, quest_id)
)`);

export function getPlayerQuests(telegramId: number) {
  const user = getUserStmt.get(telegramId)!;
  const count = (sql: string) => (db.prepare(sql).get(telegramId) as {n:number}).n;
  const progress = [
    user.total_clicks,
    count('SELECT COUNT(*) AS n FROM case_openings WHERE telegram_id=?'),
    count('SELECT COUNT(*) AS n FROM collection_discoveries WHERE telegram_id=?'),
  ];
  const claims = db.prepare('SELECT quest_id FROM player_quest_claims WHERE telegram_id=?')
    .all(telegramId) as {quest_id:number}[];
  return playerQuests.map((quest,index) => ({
    ...quest, progress:Math.min(progress[index], quest.target),
    claimed:claims.some(claim => claim.quest_id === quest.id),
  }));
}

export const claimPlayerQuest = db.transaction((telegramId: number, id: number) => {
  const user = getUserStmt.get(telegramId);
  if (!user) throw new GameError('USER_NOT_FOUND', 404);
  const quest = getPlayerQuests(telegramId).find(item => item.id === id);
  if (!quest || quest.claimed || quest.progress < quest.target) throw new GameError('QUEST_UNAVAILABLE');
  if (user.balance > Number.MAX_SAFE_INTEGER - quest.reward) throw new GameError('BALANCE_LIMIT');
  db.prepare('INSERT INTO player_quest_claims VALUES (?,?)').run(telegramId,id);
  db.prepare('UPDATE users SET balance=balance+? WHERE telegram_id=?').run(quest.reward,telegramId);
  return {reward:quest.reward};
}).immediate;
