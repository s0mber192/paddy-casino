import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { AuthError, validateInitData, type TgUser } from './auth.js';
import { GameError, listCases, openCase, registerClick, upsertUser, spinWheel, standardUpgrade, mysteryUpgrade, claimReferral, requestWithdrawal, getReferralStats, claimReferralMilestone } from './db.js';
import { giftsRoutes } from './gifts.js';

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) throw new Error('BOT_TOKEN is not set');

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const COINS_PER_CLICK = Number(process.env.COINS_PER_CLICK ?? 1);
const MIN_CLICK_INTERVAL_MS = Number(process.env.MIN_CLICK_INTERVAL_MS ?? 50);
const INIT_DATA_MAX_AGE_SEC = Number(process.env.INIT_DATA_MAX_AGE_SEC ?? 86400);

declare module 'fastify' {
  interface FastifyRequest {
    tgUser: TgUser;
  }
}

const app = Fastify({ logger: true, bodyLimit: 1024, trustProxy: true });

await app.register(cors, {
  origin: process.env.CORS_ORIGIN ?? false,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

app.decorateRequest('tgUser', undefined as unknown as TgUser);

app.addHook('onRequest', async (req, reply) => {
  if (req.method === 'OPTIONS' || !req.url.startsWith('/api/')) return;
  if (req.url.startsWith('/api/gifts/image/') || req.url.startsWith('/api/gifts/animation/')) return;

  const header = req.headers.authorization ?? '';
  const [scheme, initData] = header.split(' ', 2);
  if (scheme !== 'tma' || !initData) return reply.code(401).send({ error: 'UNAUTHORIZED' });
  try {
    req.tgUser = validateInitData(header.slice(4), BOT_TOKEN, INIT_DATA_MAX_AGE_SEC);
  } catch (e) {
    req.log.warn({ err: (e as Error).message }, 'auth failed');
    return reply.code(401).send({ error: 'UNAUTHORIZED' });
  }
});

app.setErrorHandler((err, req, reply) => {
  if (err instanceof GameError) return reply.code(err.status).send({ error: err.code });
  if (err instanceof AuthError) return reply.code(401).send({ error: 'UNAUTHORIZED' });
  req.log.error(err);
  const status = (err as { statusCode?: number }).statusCode ?? 500;
  reply.code(status).send({ error: status >= 500 ? 'INTERNAL' : 'BAD_REQUEST' });
});

app.get('/health', async () => ({ ok: true }));

app.get('/api/me', async (req) => {
  const u = upsertUser(req.tgUser);
  
  const startParam = (req.query as any).start_param || ''; 
  if (startParam.startsWith('ref_')) {
    const referrerId = Number(startParam.replace('ref_', ''));
    if (!isNaN(referrerId)) claimReferral(u.telegram_id, referrerId);
  }

  return {
    user: { id: u.telegram_id, username: u.username, firstName: u.first_name, balance: u.balance, totalClicks: u.total_clicks },
    cases: listCases(),
    config: { coinsPerClick: COINS_PER_CLICK },
  };
});

app.post('/api/click', async (req) => {
  upsertUser(req.tgUser);
  return registerClick(req.tgUser.id, COINS_PER_CLICK, MIN_CLICK_INTERVAL_MS);
});

app.post<{ Body: { caseId: number } }>('/api/case/open', async (req) => {
  upsertUser(req.tgUser);
  return openCase(req.tgUser.id, req.body.caseId);
});

app.post('/api/wheel/spin', async (req) => {
  upsertUser(req.tgUser);
  return spinWheel(req.tgUser.id);
});

app.post<{ Body: { bet: number, target: number } }>('/api/upgrade/standard', async (req) => {
  upsertUser(req.tgUser);
  return standardUpgrade(req.tgUser.id, req.body.bet, req.body.target);
});

app.post<{ Body: { bet: number } }>('/api/upgrade/mystery', async (req) => {
  upsertUser(req.tgUser);
  return mysteryUpgrade(req.tgUser.id, req.body.bet);
});

app.post<{ Body: { amount: number } }>('/api/withdraw', async (req) => {
  upsertUser(req.tgUser);
  requestWithdrawal(req.tgUser.id, req.body.amount);
  return { success: true };
});

// НОВЫЕ ЭНДПОИНТЫ РЕФЕРАЛКИ
app.get('/api/referrals', async (req) => {
  upsertUser(req.tgUser);
  return getReferralStats(req.tgUser.id);
});

app.post<{ Body: { milestone: number } }>('/api/referrals/claim', async (req) => {
  upsertUser(req.tgUser);
  return claimReferralMilestone(req.tgUser.id, req.body.milestone);
});

await app.register(giftsRoutes);

await app.register(fastifyStatic, {
  root: '/app/frontend/dist', 
  prefix: '/',
});

app.setNotFoundHandler((req, reply) => {
  if (req.raw.url?.startsWith('/api')) {
    reply.code(404).send({ error: 'NOT_FOUND' });
  } else {
    reply.sendFile('index.html');
  }
});

app.listen({ port: PORT, host: HOST }).catch((e) => {
  app.log.error(e);
  process.exit(1);
});