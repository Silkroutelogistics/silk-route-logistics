# Mileage Provider Switch Guide — Silk Route Logistics

## Current Setup

SRL uses a **provider-agnostic mileage service** that powers all mileage calculations across the platform:
- Rate calculator and load detail
- Tender / Rate Confirmation PDFs
- Carrier pay (per-mile rates)
- Financial dashboards (revenue/cost/margin per mile)
- Deadhead minimizer (carrier tools)

**Current provider:** Google Maps (estimated car distance, not truck-rated)

When using Google Maps:
- Distances show with an **amber "estimated"** badge
- PDF footnote: *"Mileage: estimated via routing software. Final billing subject to industry-standard practical truck miles."*
- No toll cost data available

## Switching to MileMaker

### Step 1: Sign Up
- Visit [milemaker.com](https://milemaker.com) and subscribe to the API plan
- Obtain OAuth 2.0 credentials (Client ID + Client Secret)

### Step 2: Add Environment Variables on Render
Go to your Render dashboard > silk-route-backend > Environment:
```
MILEMAKER_CLIENT_ID=your_client_id_here
MILEMAKER_CLIENT_SECRET=your_client_secret_here
```

### Step 3: Switch Provider
Change the mileage provider environment variable:
```
MILEAGE_PROVIDER=milemaker
```

### Step 4: Auto-Deploy
Render auto-redeploys when env vars change. All mileage calculations now use MileMaker truck-rated practical miles.

### Step 5: Clear Cache (Optional)
To force fresh calculations for all previously cached routes:
```sql
DELETE FROM mileage_cache;
```
Or wait 30 days for cache entries to naturally expire.

### Step 6: Verify
- Open any load detail page — distance badge should show **green "practical"** instead of amber "estimated"
- Check `GET /api/mileage/provider` — should return `{ "provider": "milemaker", "configured": true }`
- PDF rate confirmations will now show "MileMaker Practical Miles" with no footnote disclaimer

---

## Switching to PC*Miler (Trimble Maps)

### Step 1: Sign Up
- Visit [Trimble Maps](https://maps.trimble.com) and subscribe to the PC*Miler API
- Obtain your API key

### Step 2: Add Environment Variable on Render
```
PCMILER_API_KEY=your_api_key_here
```

### Step 3: Switch Provider
```
MILEAGE_PROVIDER=pcmiler
```

### Step 4-6: Same as MileMaker
Auto-deploy, clear cache if desired, verify with green badges.

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `MILEAGE_PROVIDER` | Yes (default: `google`) | Active provider: `google`, `milemaker`, or `pcmiler` |
| `GOOGLE_MAPS_API_KEY` | For Google provider | Google Maps Directions API key |
| `MILEMAKER_CLIENT_ID` | For MileMaker provider | MileMaker OAuth 2.0 Client ID |
| `MILEMAKER_CLIENT_SECRET` | For MileMaker provider | MileMaker OAuth 2.0 Client Secret |
| `PCMILER_API_KEY` | For PC*Miler provider | Trimble Maps / PC*Miler API key |

## Fallback Behavior

If the configured provider fails (API error, timeout, missing credentials):
1. The service automatically falls back through the chain: PC*Miler -> MileMaker -> Google
2. Fallback events are logged to the console
3. If MileMaker or PC*Miler credentials aren't configured, they silently fall back to Google

## Caching

- All mileage results are cached in the `mileage_cache` database table
- Cache TTL: **30 days**
- Cache key: MD5 hash of normalized origin + destination + provider
- Significantly reduces API costs for repeated lane calculations
- Cache is checked before any API call

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/mileage/calculate?origin=...&destination=...` | GET | Calculate mileage for a single route |
| `/api/mileage/provider` | GET | Get current provider name and status |
| `/api/mileage/batch` | POST | Batch calculate up to 50 routes |

## Badge Display

| Provider | Badge | Color |
|----------|-------|-------|
| Google Maps | `~472 mi (estimated)` | Amber |
| MileMaker | `472 mi (practical)` | Green |
| PC*Miler | `472 mi (practical)` | Green |
