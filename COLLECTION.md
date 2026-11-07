# PADDY GAME — collection edition

All balances are game-only stars. They cannot be bought, transferred, withdrawn or exchanged for real Telegram gifts. Cards are virtual collection records. Historic withdrawal records remain in SQLite for audit, but the withdrawal and Stars purchase endpoints return HTTP 410.

## Build and test

```
npm --prefix backend run build
node backend/test/collection.test.mjs
npm --prefix frontend run build
```

The integration test creates a fresh temporary SQLite database, signs test-only Telegram data and exercises the real HTTP handlers through Fastify injection. No production database or real bot token is used.

## Prices

`GIFT_PRICE_FEED_URL` is an HTTPS endpoint for an authorized normalized data adapter. `GIFT_PRICE_FEED_TOKEN` optionally supplies its bearer token. Neither value is sent to browsers. No user Telegram session is collected.

Refresh runs at startup and every 30 minutes. Each quote must be no older than one hour. The previous persisted price survives failures and restarts. Initial prices are explicitly labelled **reference**, not live market data.

Expected JSON array:

```json
[
  {
    "name": "Lunar Snake",
    "price_stars": 523,
    "source": "tonnel",
    "updated_at": 1794088800000
  }
]
```

`updated_at` is the source observation timestamp in milliseconds, not the fetch time. Sources currently accepted: `tonnel`, `mrkt`. The adapter must convert actual market quotations into the documented game-star scale; TON values must never be passed as star values without conversion. The adapter itself and authorized marketplace access are not supplied by this change. Do not call reference data live until the upstream is configured and verified.

Images are public previews from `https://t.me/nft/<GiftName>-1`; they illustrate one actual variant, not every variant in the collection. TGS animations are decompressed on the backend and cached. Missing previews show a neutral fallback. Old third-party numeric animation mappings are not used.

## Database and deployment

New tables: `collection_cards`, `gift_prices`. Existing users, balances, case IDs and opening history are retained. Existing Stars-only case rows are converted to game-point prices; no money is charged. The balance column keeps its historic name and now represents game stars.

Before every deployment:

1. Inspect the running container's actual `/data` bind mount. Do not assume it matches the old documentation.
2. Use `python3 scripts/backup-sqlite.py <actual-database-path> <backup-directory>` and verify its successful integrity check. Do not use a plain copy of a live WAL database.
3. Set `PADDY_DATA_DIR` in the server `.env` to the existing database directory. Compose deliberately fails if it is absent, instead of silently creating a fresh database directory.
4. Validate `docker compose config --quiet`, build, deploy and verify `/health`, migrations and authenticated collection flow.

For rollback after migration, restore the verified snapshot and the matching old application version together. Avoid starting the old application on the migrated database: the old startup code deletes opening history.

The Python service remains in the existing Docker topology but is not the collection price adapter. Container build and server runtime must be verified on deployment; no local Docker engine was available during implementation.
