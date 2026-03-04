# WB Tariff Orchestrator

This service periodically fetches Wildberries **box tariffs**, normalizes them into PostgreSQL, and keeps one or more **Google Sheets** in sync.

- Fetches WB box tariffs on a fixed schedule (hourly + optional daily at 00:01).
- Stores each tariff row in a **normalized** schema: numeric coefficient columns plus a key/value table for all other WB fields.
- Pushes the **latest tariff date’s** snapshot into Google Sheets as a flat table, sorted by coefficient.

---

## Features

- **WB Box Tariffs fetch (hourly)**  
  - Calls `https://common-api.wildberries.ru/api/v1/tariffs/box` with a `date` parameter (YYYY-MM-DD).
  - Uses **retry** with exponential backoff; **Zod** validation of the API response.
  - Writes to PostgreSQL via **UPSERT** (`ON CONFLICT (tariff_date, warehouse_name) DO UPDATE`).
  - At most **one row per (tariff_date, warehouse_name)** per day.

- **Google Sheets sync**  
  - **Hourly:** reads the latest `tariff_date` from `box_tariff_items`, sorts rows by coefficient (ascending), and overwrites the **stocks_coefs** sheet in each configured spreadsheet.
  - **Daily at 00:01** (server local time): same sync, so the sheet is refreshed at the start of each day.
  - Sheet **stocks_coefs** is created automatically if missing.
  - Spreadsheet IDs are read from the **spreadsheets** table first; if empty, from env (`SPREADSHEET_IDS` / `SPREADSHEET_ID`).
  - Each sync **clears** the sheet then writes the current snapshot so no stale rows from previous dates remain.

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
| `SPREADSHEET_IDS` | No | Comma-separated spreadsheet IDs (used when `spreadsheets` table is empty) |
| `SPREADSHEET_ID` | No | Single spreadsheet ID (used when `SPREADSHEET_IDS` is not set) |
| `TZ` | No | Server timezone for daily 00:01 sync (default `UTC`); e.g. `Europe/Moscow` |

Spreadsheet IDs are resolved **first from the `spreadsheets` table**; if that table is empty or unavailable, the app falls back to `SPREADSHEET_IDS` / `SPREADSHEET_ID` in `.env`. You can store IDs in the DB (e.g. via seed or manual insert) or rely on env.

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

---

## Google Sheets data format

The **stocks_coefs** sheet is a single table: one **header row** with column names, then one **data row** per warehouse for the **latest** `tariff_date` only. Rows are **sorted by coefficient ascending** (by the first available of: `boxDeliveryCoef`, `boxStorageCoef`, `boxDeliveryMarketplaceCoef`, or other coefficient-like fields).

### Structure

| Aspect | Description |
|--------|-------------|
| **Sheet name** | `stocks_coefs` |
| **Row 1** | Header: column names (see below). |
| **Row 2+** | Data: one row per tariff item (warehouse), same columns as header. |
| **Scope** | Only the **latest** `tariff_date` from the DB (no history). |
| **Order** | Sorted by coefficient (ascending). |
| **Update** | Full overwrite each sync (sheet is cleared, then rewritten). |

### Column names and types

- **Fixed columns** (always present; come from normalized DB columns):

  | Column | Type | Description |
  |--------|------|-------------|
  | `date` | string | Tariff date (YYYY-MM-DD). |
  | `geoName` | string | WB geo name. |
  | `warehouseName` | string | WB warehouse name. |
  | `boxDeliveryCoef` | number or empty | Delivery coefficient (numeric). |
  | `boxStorageCoef` | number or empty | Storage coefficient (numeric). |
  | `boxDeliveryMarketplaceCoef` | number or empty | Delivery marketplace coefficient (numeric). |

- **Additional columns** (from WB API; stored in `box_tariff_item_fields` and exported as-is):

  - Any other field returned by the WB box-tariffs API appears as a column with the **same name** as in the API (e.g. `boxDeliveryLiter`, `boxStorageBase`, `boxDeliveryBase`, `coef`, custom keys).
  - Values are written as **strings** or **numbers**; booleans are written as `1` or `0`; null/undefined as empty cell.

- **Header row:** The header is derived from the **keys of the first data row**. So the exact list of columns depends on which WB fields exist for that snapshot (fixed columns first, then any extra keys from the key/value store). Column order is consistent for all data rows.

### Example (conceptual)

```
date       | geoName | warehouseName | boxDeliveryCoef | boxStorageCoef | boxDeliveryMarketplaceCoef | boxDeliveryLiter | ...
-----------|---------|---------------|-----------------|----------------|----------------------------|------------------|----
2026-03-04 | ...     | ...           | 1.2             | 0.5            | 0.8                        | 100              | ...
```

The sheet contains **no history**: only the latest date’s snapshot. For full history, query the PostgreSQL database.

---

## Project layout

| Path | Description |
|------|-------------|
| `src/app.ts` | Entry point: runs migrations and seeds, starts HTTP status server and scheduler. |
| `src/scheduler.ts` | Schedules: hourly WB fetch, hourly Google Sheets sync, daily Sheets sync at 00:01. |
| `src/services/wb-tariffs.ts` | WB API client: fetch box tariffs (with retry and Zod validation), save via repository. |
| `src/services/google-sheets.ts` | Reads latest tariffs from DB, sorts by coefficient, clears and writes `stocks_coefs`; spreadsheet IDs from DB or env. |
| `src/repositories/box-tariff-items.ts` | Repository: UPSERT by (tariff_date, warehouse_name), get latest by tariff_date (with cache). |
| `src/types/dtos.ts` | DTOs: `BoxTariffItemDto`, `TariffSheetRowDto`, WB row types. |
| `src/utils/jobs.ts` | Job runner: centralized logging and error handling (no rethrow). |
| `src/utils/retry.ts` | Retry helper with exponential backoff. |
| `src/postgres/migrations/` | Knex migrations: `box_tariff_items`, `box_tariff_item_fields`, `spreadsheets`, numeric columns, unique index, CHECK constraints. |
| `src/postgres/seeds/` | Seed for `spreadsheets` (example row). |
| `compose.yaml` | Docker Compose: PostgreSQL + app (healthchecks, env, volumes). |
| `example.env` | Example env file (no secrets). |
| `jest.config.cjs` / `__tests__/` | Jest config and unit tests (e.g. `retry`, `jobs`). |
| `.github/workflows/ci.yml` | CI: typecheck, tests, lint, build. |

## Database

- **box_tariff_items** — main, normalized store (one row per tariff date + warehouse):
  - `id` (PK), `tariff_date` (date), `geo_name` (text), `warehouse_name` (text)
  - `box_delivery_coef`, `box_storage_coef`, `box_delivery_marketplace_coef` (numeric, nullable) — with **CHECK (value IS NULL OR value >= 0)**
  - `created_at`, `updated_at` (timestamptz)
  - **Unique** on (`tariff_date`, `warehouse_name`); UPSERT in code via `INSERT ... ON CONFLICT (...) DO UPDATE`.

- **box_tariff_item_fields** — key/value store for all other WB fields (typed):
  - `box_tariff_item_id` (FK → `box_tariff_items.id`), `field_key` (text), `field_value` (text, nullable)
  - `value_num`, `value_bool`, `value_json` (nullable) for typed storage
  - Unique per (`box_tariff_item_id`, `field_key`). Used for export to Google Sheets (e.g. `boxDeliveryLiter`, `boxStorageBase`, etc.).

- **spreadsheets**:
  - `spreadsheet_id` (PK) — list of Google Spreadsheet IDs to sync. If non-empty, the app uses this table; otherwise it uses `SPREADSHEET_IDS` / `SPREADSHEET_ID` from env.

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
  - After `docker compose up`, wait for the first run (see scheduler interval).  
  - Check logs for `[Job:wb-tariffs] success` and `[WB] Fetched N rows ...` / `[WB] Saved N rows ...`.  
  - Inspect DB (e.g. from host: `docker compose exec postgres psql -U postgres -d tariffs_db -c "SELECT tariff_date, COUNT(*) FROM box_tariff_items GROUP BY tariff_date ORDER BY tariff_date DESC;"`):

    ```sql
    SELECT tariff_date, geo_name, warehouse_name, box_delivery_coef, created_at, updated_at
    FROM box_tariff_items
    ORDER BY tariff_date DESC, warehouse_name;
    ```

- **Google Sheets**  
  - Ensure `service_account.json` is in place and mounted, and spreadsheet IDs are set (in `spreadsheets` table or `SPREADSHEET_IDS` / `SPREADSHEET_ID` in `.env`).  
  - Check logs for `[Job:google-sheets-sync] success` and `[Sheets] Resolved spreadsheet IDs from DB` or `... from env`.  
  - Open each configured spreadsheet → **stocks_coefs** tab:
    - Header row: `date`, `geoName`, `warehouseName`, `boxDeliveryCoef`, `boxStorageCoef`, `boxDeliveryMarketplaceCoef`, plus any extra WB columns.
    - Data rows: latest `tariff_date` only, sorted by coefficient ascending.

## Health / status

- The app exposes a lightweight HTTP status endpoint (by default on port `APP_PORT` or `3000`):

  - `GET /healthz` or `GET /status`  
    Returns JSON with:
    - DB connectivity flag.
    - Latest `tariff_date` from `box_tariff_items`.
    - Total number of tariff rows.

