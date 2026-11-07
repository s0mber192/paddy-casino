from fastapi import FastAPI, HTTPException
from TelegramGifts import TelegramGifts
from fastapi.middleware.cors import CORSMiddleware
import asyncio
from contextlib import asynccontextmanager
import httpx
import os
from dotenv import load_dotenv

load_dotenv()

@asynccontextmanager
async def lifespan(app):
    async with httpx.AsyncClient(timeout=15) as client:
        app.state.client = client
        yield

app = FastAPI(title="Gift Price Service", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

gifts = None
gifts_lock = asyncio.Lock()

BOT_TOKEN = os.getenv("BOT_TOKEN")
if not BOT_TOKEN:
    raise Exception("BOT_TOKEN не найден в .env")

@app.get("/health")
async def health():
    return {"ok": True, "collection_price_feed": "separate_adapter"}

@app.get("/gifts")
async def list_gifts():
    global gifts
    try:
        async with gifts_lock:
            if gifts is None:
                gifts = await asyncio.to_thread(TelegramGifts, cache_mode="http")
        all_gifts = await asyncio.to_thread(gifts.get_regular_gifts)
        result = []
        
        # Берем первые 30 подарков для примера
        for g in all_gifts[:30]:
            name = getattr(g, 'full_name', 'Unknown')
            slug = getattr(g, 'slug', None)
            
            if not slug:
                continue

            # 1. Получаем цену через официальный API Telegram
            price_ton = 0.0
            try:
                res = await app.state.client.post(
                    f"https://api.telegram.org/bot{BOT_TOKEN}/getUniqueStarGiftValueInfo",
                    json={"slug": slug}
                )
                if res.status_code == 200:
                    data = res.json()
                    if data.get("ok") and data.get("result"):
                        # Цена приходит в нано-TON, переводим
                        floor_price_nano = data["result"].get("floor_price", 0)
                        price_ton = floor_price_nano / 1_000_000_000
            except Exception as e:
                print(f"Ошибка получения цены для {name}")

            # 2. Формируем ссылку на картинку с Fragment CDN
            image_url = f"https://nft.fragment.com/gift/{slug}.large.webp"

            result.append({
                "name": name,
                "price_ton": price_ton,
                "image_url": image_url
            })
        
        # Сортируем по цене
        result.sort(key=lambda x: x["price_ton"])
        return result
    except Exception as e:
        raise HTTPException(status_code=503, detail="Gift provider unavailable") from None

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)