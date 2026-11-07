import type {FastifyInstance} from 'fastify';
import {gunzipSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {GIFTS} from './catalog.js';
import {catalogWithPrices} from './prices.js';

const cache = new Map<string,{expires: number; data: unknown}>();
const pending = new Map<string,Promise<unknown>>();
async function animationFor(id: string) {
  const hit=cache.get(id);
  if(hit && hit.expires>Date.now()) return hit.data;
  const existing=pending.get(id);
  if(existing) return existing;
  const task=(async()=>{
    const gift=GIFTS.find(g=>String(g.id)===id);
    if(!gift) throw new Error('Gift not found');
    try {
      const directory=process.env.STATIC_DIR ?? path.resolve('..','frontend','dist');
      const text=await readFile(path.join(directory,'gifts',`${id}.json`),'utf8');
      const data=JSON.parse(text);
      if(!Array.isArray(data.layers)) throw new Error('Invalid bundled animation');
      if(cache.size>=30) cache.delete(cache.keys().next().value!);
      cache.set(id,{expires:Date.now()+24*60*60*1000,data});
      return data;
    } catch(error) {
      if((error as NodeJS.ErrnoException).code!=='ENOENT') throw error;
    }
    const slug=gift.name.replace(/[^a-z0-9]/gi,'');
    // Official public collectible preview: use a real named gift, not the old
    // third-party numeric sticker IDs, which did not reliably match names.
    const page=await fetch(`https://t.me/nft/${slug}-1`,{signal:AbortSignal.timeout(10_000)});
    if(!page.ok) throw new Error('Preview unavailable');
    const html=await page.text();
    if(html.length>1_000_000) throw new Error('Preview too large');
    const match=html.match(/https:\/\/cdn\d+\.telesco\.pe\/file\/sticker\.tgs\?token=[^"\s<>]+/);
    if(!match) throw new Error('No official gift animation');
    const resource=await fetch(match[0].replace(/&amp;/g,'&'),{signal:AbortSignal.timeout(10_000),redirect:'error'});
    if(!resource.ok) throw new Error('Animation unavailable');
    const bytes=Buffer.from(await resource.arrayBuffer());
    if(bytes.length>2_000_000) throw new Error('Animation too large');
    const text=bytes[0]===0x1f && bytes[1]===0x8b ? gunzipSync(bytes,{maxOutputLength:5_000_000}).toString('utf8') : bytes.toString('utf8');
    const data=JSON.parse(text);
    if(!data || !Array.isArray(data.layers)) throw new Error('Invalid animation');
    if(cache.size>=30) cache.delete(cache.keys().next().value!);
    cache.set(id,{expires:Date.now()+24*60*60*1000,data});
    return data;
  })();
  pending.set(id,task);
  try{return await task;}finally{pending.delete(id);}
}
export async function giftsRoutes(app: FastifyInstance){
  app.get('/api/gifts/list',async()=>catalogWithPrices());
  app.get('/api/gifts/animation/:id',async(req,reply)=>{
    const {id}=req.params as {id:string};
    if(!GIFTS.some(g=>String(g.id)===id)) return reply.code(404).send({error:'NOT_FOUND'});
    try{return reply.header('Cache-Control','public,max-age=3600').send(await animationFor(id));}
    catch{return reply.code(502).send({error:'ANIMATION_UNAVAILABLE'});}
  });
}
