# Testing Guide — Asisten AI Trading System

## Prerequisites

1. **Docker Desktop** (recommended) atau instal manual:
   - PostgreSQL 16 + pgvector extension
   - Redis 7+ (untuk BullMQ queue)
2. **Environment file:**
   - Copy `.env.example` → `.env`
   - Isi minimal: `SUMOPOD_API_KEY`, `INDODAX_API_KEY` (opsional untuk paper-only)

## Quick Start (Production-like)

```bash
# 1. Start infra (pilih salah satu)
# Option A: Docker
docker compose up -d

# Option B: Manual (Postgres + Redis running)
# Pastikan POSTGRES dan REDIS aktif di localhost

# 2. Push schema ke DB
npm run db:push

# 3. Run dev server (paper trading active)
npm run dev
```

## Testing Endpoints

- GET `http://localhost:3000/health` → cek server up
- POST `http://localhost:3000/api/chat` (JSON: `{ "message": "check price btcidr", "userId": "test" }`) → test orchestrator

## Manual Trading Cycle Trigger

```bash
# Jika punya TELEGRAM_BOT_TOKEN di .env:
# Buka Telegram, /cycle untuk trigger manual

# Atau pakai BullMQ CLI:
npx bullmq-dashboard  # buka di http://localhost:3001
```

## Verify WS + RiskManager

Buka logs terminal `npm run dev` — cari:
- `Indodax Market WS connected` (WS aktif)
- `Trading cycle BullMQ scheduler registered (every 15 minutes)` (scheduler jalan)

## Go-Live Readiness Check

| Item | Status | Cara Cek |
|---|---|---|
| Redis connection | ✅ | `redis-cli ping` → PONG |
| DB + pgvector | ✅ | `psql -c "SELECT * FROM vectors;"` |
| SUMOPOD_API_KEY | ⚠️ | Required untuk LLM calls |
| INDODAX keys | ⚠️ | Opsional (paper-only works tanpa) |
| RiskManager persist | ✅ | Redis hash: `HGETALL risk:state` setelah trade |

## Next Steps Setelah Test

1. **Paper trading 24h** (monitor decision_audit table)
2. Set `TELEGRAM_BOT_TOKEN` untuk notifikasi
3. Review `decision_audit` query: `SELECT * FROM decision_audit ORDER BY created_at DESC LIMIT 10;`
4. Hitung win rate di paper: `SELECT AVG(CASE WHEN final_score > 70 THEN 1 ELSE 0 END) FROM decision_audit WHERE action = 'score_opportunity';`

---

**Catatan:** Tanpa Docker, gunakan Postgres lokal dan pastikan `DATABASE_URL`/`REDIS_URL` di `.env` sesuai.