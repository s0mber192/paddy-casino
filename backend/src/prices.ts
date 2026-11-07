import type { FastifyBaseLogger } from 'fastify';
import { db } from './db.js';
import { GIFTS } from './catalog.js';

export const PRICE_INTERVAL_MS = 30 * 60 * 1000;
interface Quote { name: string; price_stars: number; updated_at: number; source: 'tonnel' | 'mrkt' }
export function applyQuotes(input: unknown, now = Date.now()) {
  if (!Array.isArray(input) || input.length > 5000) throw new Error('Invalid price feed');
  const updates: {id: string; price: number; source: string; at: number}[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid quote');
    const quote = raw as Quote;
    if (typeof quote.name !== 'string' || !Number.isFinite(quote.price_stars) || quote.price_stars < 1 || quote.price_stars > 100_000_000 || !Number.isSafeInteger(quote.updated_at) || quote.updated_at > now + 60_000 || quote.updated_at < now - 60 * 60 * 1000 || !['tonnel', 'mrkt'].includes(quote.source)) throw new Error('Invalid or stale quote');
    const gift = GIFTS.find(g => g.name.toLowerCase() === quote.name.toLowerCase());
    if (gift) updates.push({id: String(gift.id), price: Math.round(quote.price_stars), source: quote.source, at: quote.updated_at});
  }
  if (!updates.length) throw new Error('No matching gift prices');
  db.transaction(() => {
    const statement = db.prepare('UPDATE gift_prices SET price=@price,source=@source,updated_at=@at WHERE gift_id=@id AND (updated_at IS NULL OR updated_at < @at)');
    for (const update of updates) statement.run(update);
  })();
  return updates.length;
}

export function catalogWithPrices() {
  const prices = db.prepare('SELECT gift_id,price,source,updated_at FROM gift_prices').all() as {gift_id: string; price: number; source: string; updated_at: number | null}[];
  const byId = new Map(prices.map(p => [p.gift_id, p]));
  return GIFTS.map(g => {
    const p = byId.get(String(g.id))!;
    return { id: String(g.id), name: g.name, price_stars: p.price, animation_url: `/api/gifts/animation/${g.id}?v=official-1`, price_source: p.source, price_updated_at: p.updated_at, price_stale: !p.updated_at || Date.now() - p.updated_at > 60 * 60 * 1000 };
  });
}

// An authorized adapter must normalize marketplace quotes into game-star units.
// No Telegram session credentials are collected from players.
export function startPriceRefresh(log: FastifyBaseLogger) {
  const endpoint = process.env.GIFT_PRICE_FEED_URL;
  if (!endpoint || process.env.APP_TEST === '1') {
    log.warn('Live price feed is not configured; reference prices are explicitly labelled');
    return () => {};
  }
  const url = new URL(endpoint);
  if (url.protocol !== 'https:') throw new Error('GIFT_PRICE_FEED_URL must use HTTPS');
  let running = false;
  const controller = new AbortController();
  const refresh = async () => {
    if (running) return;
    running = true;
    try {
      const headers: Record<string,string> = {'Accept': 'application/json'};
      if (process.env.GIFT_PRICE_FEED_TOKEN) headers.Authorization = `Bearer ${process.env.GIFT_PRICE_FEED_TOKEN}`;
      const response = await fetch(url, {headers, redirect: 'error', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)])});
      if (!response.ok) throw new Error('Price source unavailable');
      const text = await response.text();
      if (text.length > 2_000_000) throw new Error('Price feed too large');
      const count = applyQuotes(JSON.parse(text));
      log.info({count}, 'Market prices refreshed');
    } catch {
      log.warn('Price refresh failed; keeping last verified snapshot');
    } finally { running = false; }
  };
  void refresh();
  const timer = setInterval(() => void refresh(), PRICE_INTERVAL_MS);
  timer.unref();
  return () => { clearInterval(timer); controller.abort(); };
}
