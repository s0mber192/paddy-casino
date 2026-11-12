import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { AuthError, validateInitData, type TgUser } from './auth.js';
import { GameError, listCases, openCase, registerClick, getClicker, improveClicker, getRocket, launchRocket, cashRocket, settleRocketAutos, upsertUser, spinWheel, standardUpgrade, mysteryUpgrade, getReferralStats, claimReferralMilestone, getPlayerQuests, claimPlayerQuest, getCollection, getCollectionProgress, sellCard, upgradeCard } from './db.js';
import { giftsRoutes } from './gifts.js';
import { startPriceRefresh } from './prices.js';

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) throw new Error('BOT_TOKEN is not set');

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const COINS_PER_CLICK = Number(process.env.COINS_PER_CLICK ?? 1);
const INIT_DATA_MAX_AGE_SEC = Number(process.env.INIT_DATA_MAX_AGE_SEC ?? 86400);

declare module 'fastify' {
  interface FastifyRequest {
    tgUser: TgUser;
  }
}

export const app = Fastify({ ajv: {customOptions: {coerceTypes: false}}, logger: {redact: ['req.headers.authorization']}, bodyLimit: 1024, trustProxy: true });

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

const integer = {type: 'integer', minimum: 1, maximum: 100_000_000};
const schemas: Record<string, Record<string, unknown>> = {
  '/api/clicker/improve': {action:{type:'string',enum:['power','bear','collect']}},
  '/api/rocket/cash': {launched:{type:'integer', minimum:1, maximum:Number.MAX_SAFE_INTEGER}},
  '/api/quests/claim': {id: integer},
  '/api/referrals/claim': {milestone: integer},
  '/api/case/open': {caseId: integer},
  '/api/upgrade/standard': {bet: integer, giftId: {type: 'string', pattern: '^[0-9]+$', maxLength: 10}},
  '/api/upgrade/mystery': {bet: integer},
  '/api/collection/sell': {cardId: integer},
  '/api/collection/upgrade': {cardId: integer, giftId: {type: 'string', pattern: '^[0-9]+$', maxLength: 10}},
};
app.addHook('onRoute', (route) => {
  const properties = schemas[route.url];
  if (properties) route.schema = {...route.schema, body: {type: 'object', additionalProperties: false, required: Object.keys(properties), properties}};
});

app.get('/health' , async () => ({ ok: true, mode: 'collection' }));

app.get('/api/me', async (req) => {
  const u = upsertUser(req.tgUser);
  const {bonus, ...progress} = getCollectionProgress.immediate(u.telegram_id);
  return {
    progress,
    clicker: getClicker(u.telegram_id,COINS_PER_CLICK),
    quests: getPlayerQuests(u.telegram_id),
    referrals: getReferralStats(u.telegram_id),
    wheelReadyAt: u.last_wheel_spin ? u.last_wheel_spin + 24 * 60 * 60 * 1000 : 0,
    user: { id: u.telegram_id, username: u.username, firstName: u.first_name, balance: u.balance + bonus, totalClicks: u.total_clicks },
    cases: listCases(),
    collection: getCollection(u.telegram_id), config: { coinsPerClick: COINS_PER_CLICK, virtualOnly: true },
  };
});

app.post<{Body: {count?:number}}>('/api/click', {
  schema:{body:{type:'object',additionalProperties:false,properties:{count:{type:'integer',minimum:1,maximum:12}}}},
}, async req => {
  upsertUser(req.tgUser);
  return registerClick(req.tgUser.id,COINS_PER_CLICK,req.body?.count ?? 1);
});
app.post<{Body: {action:'power'|'bear'|'collect'}}>('/api/clicker/improve', async req => {
  upsertUser(req.tgUser);
  return improveClicker(req.tgUser.id,req.body.action,COINS_PER_CLICK);
});
if (process.env.APP_TEST !== '1') setInterval(() => {
  try {settleRocketAutos();} catch (error) {app.log.error(error);}
},500).unref();
app.get('/api/rocket',async req => getRocket(req.tgUser.id));
app.post<{Body: {cardId?:number; coins?:number; autoX?:number}}>('/api/rocket/launch', {
  schema:{body:{type:'object',additionalProperties:false,properties:{
    cardId:integer,coins:integer,autoX:{type:'number',minimum:1.01,maximum:29.99},
  }}},
}, async req => launchRocket(req.tgUser.id,req.body.cardId,req.body.autoX === undefined ? null : Math.round(req.body.autoX * 100) / 100,req.body.coins));
app.post<{Body: {launched:number}}>('/api/rocket/cash',async req => cashRocket(req.tgUser.id,req.body.launched));

app.post<{ Body: { caseId: number } }>('/api/case/open', async (req) => {
  upsertUser(req.tgUser);
  return openCase(req.tgUser.id, req.body.caseId);
});

app.post('/api/wheel/spin', async (req) => {
  upsertUser(req.tgUser);
  return spinWheel(req.tgUser.id);
});

app.post<{ Body: { bet: number, giftId: string } }>('/api/upgrade/standard', async (req) => {
  upsertUser(req.tgUser);
  return standardUpgrade(req.tgUser.id, req.body.bet, req.body.giftId);
});

app.post<{ Body: { bet: number } }>('/api/upgrade/mystery', async (req) => {
  upsertUser(req.tgUser);
  return mysteryUpgrade(req.tgUser.id, req.body.bet);
});

app.post('/api/withdraw', async (_req, reply) => reply.code(410).send({error: 'VIRTUAL_ONLY'}));
app.post('/api/case/open-stars', async (_req, reply) => reply.code(410).send({error: 'VIRTUAL_ONLY'}));
app.post<{Body: {cardId: number}}>('/api/collection/sell', async (req) => sellCard(req.tgUser.id, req.body.cardId));

app.post<{Body: {cardId: number; giftId: string}}>('/api/collection/upgrade', async (req) => upgradeCard(req.tgUser.id, req.body.cardId, req.body.giftId));

// НОВЫЕ ЭНДПОИНТЫ РЕФЕРАЛКИ
app.get('/api/referrals', async (req) => {
  upsertUser(req.tgUser);
  return getReferralStats(req.tgUser.id);
});

app.post<{Body: {milestone: number}}>('/api/referrals/claim', async (req) => claimReferralMilestone(req.tgUser.id, req.body.milestone));

app.post<{Body: {id: number}}>('/api/quests/claim', async req => claimPlayerQuest(req.tgUser.id, req.body.id));

await app.register(giftsRoutes);

await app.register(fastifyStatic, {
  root: process.env.STATIC_DIR ?? path.resolve('..', 'frontend', 'dist'),
  prefix: '/',
});

app.setNotFoundHandler((req, reply) => {
  if (req.raw.url?.startsWith('/api')) {
    reply.code(404).send({ error: 'NOT_FOUND' });
  } else {
    reply.sendFile('index.html');
  }
});

const stopPrices = startPriceRefresh(app.log);
app.addHook('onClose', async () => stopPrices());

if (process.env.APP_TEST !== '1') app.listen({ port: PORT, host: HOST }).catch((e) => {
  app.log.error(e);
  process.exit(1);
});
