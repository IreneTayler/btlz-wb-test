# WB Tariff Orchestrator

This service periodically fetches Wildberries **box tariffs**, normalizes them into PostgreSQL, and keeps one or more **Google Sheets** in sync.

- Fetch WB box tariffs on a fixed schedule.
- Store each tariff row in a normalized schema (typed numeric fields + key/value extension).
- Push the latest snapshot into Google Sheets as a flat, human‑readable table.

## Features

- **Hourly WB Box Tariffs fetch**  
  - Calls `https://common-api.wildberries.ru/api/v1/tariffs/box` every **hour**.
  - Stores each tariff row as a separate record in `box_tariff_items`.
  - For each `(date, warehouse)`:
    - The **first run of the day** INSERTs one row.
    - All later runs on the same day only **UPDATE** that row (no extra daily duplicates).

- **Google Sheets sync (stocks_coefs)**  
  - Every hour, reads the **latest date’s** rows from `box_tariff_items`.
  - Sorts them by coefficient (ascending).
  - Writes them into the `stocks_coefs` sheet in each configured spreadsheet  
    (created automatically if missing).

## Requirements

- Docker and Docker Compose
- WB API token (any category)
- Optional: Google Cloud service account with Sheets API for spreadsheet updates

## Quick start (Docker)

1. **Create env file**

   ```bash
   cp example.env .env
   ```

   Edit `.env` and set at least:

   - `WB_API_TOKEN` — your Wildberries API token (required).
   - `SPREADSHEET_IDS` or `SPREADSHEET_ID` — target Google spreadsheet(s) (optional, only if you want Sheets sync).

2. **Run**

   ```bash
   docker compose up --build
   ```

   Use `--build` whenever you change code or add migrations so the image includes the latest files.

   This starts PostgreSQL and the app. The app runs **migrations and seeds on startup**, then starts:

   - WB box tariffs fetch every **hour**.
   - DB updates every **hour**, with at most **one row per (date, warehouse)** per day.
   - Google Sheets sync every **hour** (if configured).

No other steps are required for WB tariffs; data begins accumulating in PostgreSQL and, if configured, appears in Google Sheets.

### If database changes aren’t applied yet

- **With Docker:** Rebuild the app image so new migrations are in the image, then start the stack. Migrations run automatically when the app starts.
  ```bash
  docker compose build app
  docker compose up -d
  ```
  Or run migrations once in a one-off container (same DB, then start the app as usual):
  ```bash
  docker compose run --rm app node dist/utils/knex.js migrate:latest
  ```

- **Without Docker:** Run migrations, then start the app:
  ```bash
  npm run knex:dev migrate:latest
  npm run dev
  ```
  (The app also runs `migrate.latest()` on startup, so starting the app is enough if the code is up to date.)

## Configuration

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `POSTGRES_HOST` | — | Default in compose: `postgres` |
| `POSTGRES_PORT` | — | Default: `5432` |
| `POSTGRES_DB` | — | Default: `tariffs_db` |
| `POSTGRES_USER` | — | Default: `postgres` |
| `POSTGRES_PASSWORD` | — | Default: `12345678` |
| `WB_API_TOKEN` | Yes | Wildberries API token |
| `GOOGLE_APPLICATION_CREDENTIALS` | No | Path to service account JSON (e.g. `/app/service-account.json`) |
| `SPREADSHEET_IDS` | No | Comma-separated spreadsheet IDs to update (overrides DB) |
| `SPREADSHEET_ID` | No | Single spreadsheet ID (used if `SPREADSHEET_IDS` not set) |

Spreadsheet IDs can also come from the `spreadsheets` table (seed inserts an example row), but in this project the **recommended way** is to use `SPREADSHEET_IDS` / `SPREADSHEET_ID` in `.env`.

### Google Sheets

1. Create a Google Cloud project and enable the Google Sheets API.
2. Create a service account and download its JSON key.
3. Copy the key into the project root as `service-account.json` (or another path you mount).
4. Make sure `compose.yaml` mounts the credentials file (already configured in this repo):

   ```yaml
   volumes:
     - ./service_account.json:/app/service_account.json:ro
   ```

5. Share each target spreadsheet with the service account email (Editor).
6. Set `SPREADSHEET_IDS` or `SPREADSHEET_ID` in `.env` (comma–separated for multiple).

On startup the app will create (if needed) a sheet named **stocks_coefs** in each spreadsheet and will keep overwriting its contents with the latest tariffs snapshot.

## Project layout

- `src/app.ts` — Entry point: runs migrations & seeds, then starts the scheduler.
- `src/scheduler.ts` — Schedules WB fetch + Sheets sync every 2 minutes.
- `src/services/wb-tariffs.ts` — Talks to WB API and writes per‑row tariffs to PostgreSQL.
- `src/services/google-sheets.ts` — Reads latest tariffs from DB, sorts by coefficient, and writes to `stocks_coefs` in Google Sheets.
- `src/postgres/migrations/` — Knex migrations (`box_tariffs`, `box_tariff_items`, `spreadsheets`, etc.).
- `src/postgres/seeds/` — Seed for `spreadsheets` (example row).
- `src/types/wb-tariffs.ts` — Types for the WB box tariffs API response.
- `compose.yaml` — Docker Compose config for PostgreSQL + app.
- `example.env` — Example env file (no secrets).
- `service-account.json.example` — Example structure for Google credentials (no keys).

## Database

- **box_tariff_items** — main, normalized store:
  - `id` (PK)
  - `tariff_date` (date)
  - `geo_name` (text)
  - `warehouse_name` (text)
  - `box_delivery_coef` (numeric, nullable)
  - `box_storage_coef` (numeric, nullable)
  - `box_delivery_marketplace_coef` (numeric, nullable)
  - `created_at` (timestamptz) — when this snapshot row was first inserted
  - `updated_at` (timestamptz) — last time this row was refreshed
  - Unique key on (`tariff_date`, `warehouse_name`) with UPSERT (`ON CONFLICT`) in code.

- **box_tariff_item_fields** — extension table for *all* WB fields:
  - `id` (PK)
  - `box_tariff_item_id` (FK → `box_tariff_items.id`, ON DELETE CASCADE)
  - `field_key` (text) — original WB field name (e.g. `boxDeliveryBase`, `boxDeliveryLiter`, `boxStorageBase`, …)
  - `field_value` (text, nullable) — human‑readable value
  - `value_num` (numeric, nullable) — numeric representation (for searching/sorting)
  - `value_bool` (boolean, nullable)
  - `value_json` (jsonb, nullable) — complex objects/arrays
  - Unique per (`box_tariff_item_id`, `field_key`)

- **spreadsheets**:
  - `spreadsheet_id` (PK) — optional DB list of Google spreadsheets (env vars are preferred in this project).

## Running without Docker

1. Install Node 20+ and PostgreSQL.
2. Create `.env` from `example.env` and set `WB_API_TOKEN`, DB vars, and Google vars if needed.
3. Run migrations and seeds:

   ```bash
   npm run knex:dev migrate:latest
   npm run knex:dev seed run
   ```
   (You can also use `npm run knex:dev migrate latest` with a space.)

4. Start the app:

   ```bash
   npm run build && npm run start
   # or, for dev:
   npm run dev
   ```

## How to verify it’s working

- **WB tariffs in DB**  
  - After `docker compose up`, wait a few minutes.  
  - Check logs for `[WB] Box tariffs fetched and saved.`  
  - Inspect DB:

    ```sql
    SELECT tariff_date, geo_name, warehouse_name, created_at, updated_at
    FROM box_tariff_items
    ORDER BY tariff_date DESC, warehouse_name, created_at;
    ```

- **Google Sheets**  
  - Ensure `service_account.json` is in place and mounted, and `SPREADSHEET_IDS` / `SPREADSHEET_ID` are set in `.env`.
  - Check logs for `[Sheets] Tariffs synced to spreadsheets.`  
  - Open each configured spreadsheet and look for the **stocks_coefs** tab:
    - You should see a header row with keys like `date`, `geoName`, `warehouseName`, etc.
    - Data rows beneath it should match the latest `box_tariff_items` entries, sorted by coefficient ascending.

## Health / status

- The app exposes a lightweight HTTP status endpoint (by default on port `APP_PORT` or `3000`):

  - `GET /healthz` or `GET /status`  
    Returns JSON with:
    - DB connectivity flag.
    - Latest `tariff_date` from `box_tariff_items`.
    - Total number of tariff rows.

