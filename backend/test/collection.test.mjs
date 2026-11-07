import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'paddy-collection-'));
process.env.DB_PATH = path.join(directory, 'test.db');
process.env.BOT_TOKEN = 'test-only-not-a-real-token';
process.env.APP_TEST = '1';
process.env.STATIC_DIR = path.join(root, 'frontend/dist');
const {app} = await import('../dist/index.js');
const {db} = await import('../dist/db.js');
const {applyQuotes, catalogWithPrices} = await import('../dist/prices.js');
function authorization(id) {
  const params = new URLSearchParams({auth_date: String(Math.floor(Date.now()/1000)), user: JSON.stringify({id, first_name: 'Test'})});
  const check = [...params.entries()].map(([k,v])=>`${k}=${v}`).sort().join('\n');
  const key = crypto.createHmac('sha256','WebAppData').update(process.env.BOT_TOKEN).digest();
  params.set('hash',crypto.createHmac('sha256',key).update(check).digest('hex'));
  return `tma ${params}`;
}
async function request(url, body, user=1) {
  return app.inject({method:body===undefined?'GET':'POST', url, headers:{authorization:authorization(user)}, ...(body===undefined?{}:{payload:body})});
}
function balance(id=1) {return db.prepare('SELECT balance FROM users WHERE telegram_id=?').get(id).balance;}
try {
  await app.ready();
  assert.equal((await app.inject({method:'GET',url:'/api/me'})).statusCode,401);
  assert.equal((await request('/api/me')).statusCode,200);
  await request('/api/me',undefined,2);
  assert.equal((await request('/api/me?start_param=ref_2')).json().user.balance,0);
  assert.equal((await request('/api/click',{})).json().earned,1);
  const initial = balance();
  assert.equal((await request('/api/withdraw',{amount:1000})).statusCode,410);
  assert.equal((await request('/api/case/open-stars',{caseId:1})).statusCode,410);
  assert.equal((await request('/api/referrals/claim',{milestone:5})).statusCode,410);
  assert.equal(balance(),initial);
  db.prepare('UPDATE users SET balance=10000 WHERE telegram_id=1').run();
  for (const bet of [-1,0,1.5,'100',null,100_000_001]) {
    assert.equal((await request('/api/upgrade/standard',{bet,giftId:'59'})).statusCode,400);
    assert.equal(balance(),10000);
  }
  assert.equal((await request('/api/upgrade/standard',{bet:100,giftId:'missing'})).statusCode,400);
  const quotes=catalogWithPrices();
  assert.ok(quotes.length>50);
  assert.ok(quotes.every(g=>g.price_source==='reference' && g.price_stale && g.price_updated_at===null));
  const now=Date.now();
  applyQuotes([{name:'Lunar Snake',price_stars:2000,source:'tonnel',updated_at:now}]);
  assert.equal(catalogWithPrices().find(g=>g.id==='59').price_stars,2000);
  assert.throws(()=>applyQuotes([{name:'Lunar Snake',price_stars:-10,source:'tonnel',updated_at:now+1}]));
  assert.throws(()=>applyQuotes([{name:'Lunar Snake',price_stars:5,source:'tonnel',updated_at:now-4_000_000}]));
  assert.equal(catalogWithPrices().find(g=>g.id==='59').price_stars,2000);
  const upgrade=await request('/api/upgrade/standard',{bet:100,giftId:'59'});
  assert.equal(upgrade.statusCode,200);
  assert.equal(balance(),9900);
  assert.equal(upgrade.json().chancePercent,5);
  const card=Number(db.prepare("INSERT INTO collection_cards(telegram_id,gift_id,created_at) VALUES(1,'59',?)").run(now).lastInsertRowid);
  assert.equal((await request('/api/collection/sell',{cardId:card},2)).statusCode,404);
  const before=balance();
  db.exec("CREATE TRIGGER fail_card_delete BEFORE DELETE ON collection_cards BEGIN SELECT RAISE(ABORT,'test failure'); END;");
  assert.equal((await request('/api/collection/sell',{cardId:card})).statusCode,500);
  assert.equal(balance(),before);
  assert.ok(db.prepare('SELECT id FROM collection_cards WHERE id=?').get(card));
  db.exec('DROP TRIGGER fail_card_delete');
  const sold=await request('/api/collection/sell',{cardId:card});
  assert.equal(sold.statusCode,200);
  assert.equal(balance(),before+2000);
  assert.equal((await request('/api/collection/sell',{cardId:card})).statusCode,404);
  assert.equal(balance(),before+2000);
  const owned=Number(db.prepare("INSERT INTO collection_cards(telegram_id,gift_id,created_at) VALUES(1,'59',?)").run(now).lastInsertRowid);
  assert.equal((await request('/api/collection/upgrade',{cardId:owned,giftId:'164'},2)).statusCode,404);
  const cardUpgrade=await request('/api/collection/upgrade',{cardId:owned,giftId:'164'});
  assert.equal(cardUpgrade.statusCode,200);
  assert.equal(db.prepare('SELECT id FROM collection_cards WHERE id=?').get(owned),undefined);
  assert.equal((await request('/api/collection/upgrade',{cardId:owned,giftId:'164'})).statusCode,404);
  const collection=(await request('/api/me')).json();
  assert.equal(collection.config.virtualOnly,true);
  assert.ok(collection.cases.every(c=>c.currency==='coins' && c.price_stars===0));
  assert.equal((await request('/api/wheel/spin',{})).statusCode,200);
  assert.equal((await request('/api/wheel/spin',{})).statusCode,429);
  assert.deepEqual(db.pragma('foreign_key_check'),[]);
  assert.equal(db.pragma('integrity_check',{simple:true}),'ok');
  console.log('PASS: authentication, virtual-only routes, strict input checks, market quotes, upgrade ownership, atomic sale rollback, double-sale prevention, collection and daily cooldown.');
} finally {await app.close();db.close();}
// Reopen in a second process to execute real startup and migration again.
const {spawnSync}=await import('node:child_process');
const result=spawnSync(process.execPath,['--input-type=module','-e',`const {db}=await import(${JSON.stringify(new URL('../dist/db.js',import.meta.url).href)});const assert=await import('node:assert/strict');assert.default.equal(db.prepare('SELECT price FROM gift_prices WHERE gift_id=?').get('59').price,2000);assert.default.ok(db.prepare('SELECT balance FROM users WHERE telegram_id=1').get());assert.default.equal(db.prepare('SELECT COUNT(*) AS n FROM cases').get().n,4);db.close();`],{env:process.env,encoding:'utf8'});
assert.equal(result.status,0,result.stderr);
console.log('PASS: restart retains players, current quotes and idempotent case catalog.');
