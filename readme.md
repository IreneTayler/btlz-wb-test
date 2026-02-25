# WB Tariffs Service

Service that (1) fetches Wildberries box tariffs hourly and stores them in PostgreSQL per day, and (2) syncs current tariffs to Google Sheets on a schedule.

## Features

- **Hourly WB Box Tariffs**: Fetches from `https://common-api.wildberries.ru/api/v1/tariffs/box`, stores/updates one row per day in the database (same day is overwritten on each hourly run).
- **Google Sheets sync**: Reads spreadsheet IDs from env or from the `spreadsheets` table, writes latest tariffs to the sheet **stocks_coefs** (created if missing), sorted by coefficient ascending.

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

2. **Run**

   ```bash
   docker compose up --build
   ```

   This starts PostgreSQL and the app. The app runs migrations and seeds, then starts:

   - Hourly box-tariffs fetch and save
   - Periodic sync of tariffs to Google Sheets (if configured)

No other steps are required for WB tariffs; data is stored in the `box_tariffs` table by date.

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

Spreadsheet IDs can also come from the `spreadsheets` table (seed inserts an example row). Env IDs take precedence.

### Google Sheets

1. Create a Google Cloud project and enable the Google Sheets API.
2. Create a service account and download its JSON key.
3. Copy the key into the project root as `service-account.json` (or another path you mount).
4. In `compose.yaml`, uncomment the `volumes` section under `app` and mount the file, e.g.:

   ```yaml
   volumes:
     - ./service-account.json:/app/service-account.json:ro
   ```

5. Share each target spreadsheet with the service account email (Editor).
6. Set `SPREADSHEET_IDS` or `SPREADSHEET_ID` in `.env`, or add IDs to the `spreadsheets` table.

The app will create a sheet named **stocks_coefs** in each spreadsheet if it does not exist, and write tariff data there, sorted by coefficient ascending.

## Project layout

- `src/app.ts` — Entry: migrations, seeds, then scheduler.
- `src/scheduler.ts` — Hourly WB job and periodic Sheets sync.
- `src/services/wb-tariffs.ts` — WB API fetch and DB save.
- `src/services/google-sheets.ts` — Read tariffs from DB, sort by coefficient, write to Sheets.
- `src/postgres/migrations/` — Knex migrations (`box_tariffs`, `spreadsheets`).
- `src/postgres/seeds/` — Seed for `spreadsheets` (example row).
- `src/types/wb-tariffs.ts` — Types for WB box tariffs API.
- `compose.yaml` — PostgreSQL + app services.
- `example.env` — Example env (no secrets).
- `service-account.json.example` — Example structure for Google credentials (no keys).

## Database

- **box_tariffs**: `tariff_date` (date, PK), `data` (jsonb), `updated_at`. One row per day; hourly runs update the same day.
- **spreadsheets**: `spreadsheet_id` (PK). Optional list of Google spreadsheet IDs to sync.

## Running without Docker

1. Install Node 20+, PostgreSQL, run migrations and seeds (e.g. `npm run knex:dev migrate latest`, `npm run knex:dev seed run`).
2. Create `.env` from `example.env` and set `WB_API_TOKEN` (and DB/Google vars if needed).
3. Run:

   ```bash
   npm run build && npm run start
   ```

   Or in development:

   ```bash
   npm run dev
   ```

## Testing

- **WB tariffs**: After `docker compose up`, wait for the first run (runs on startup and then every hour). Check logs for `[WB] Box tariffs fetched and saved.` Query the DB: `SELECT tariff_date, updated_at, jsonb_array_length(data) FROM box_tariffs;`
- **Google Sheets**: Set `GOOGLE_APPLICATION_CREDENTIALS`, mount `service-account.json`, set `SPREADSHEET_ID` or `SPREADSHEET_IDS`, and ensure the spreadsheet is shared with the service account. Check logs for `[Sheets] Tariffs synced to spreadsheets.` and open the spreadsheet; sheet **stocks_coefs** should contain tariff rows sorted by coefficient.
