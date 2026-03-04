import fs from "fs";
import { google } from "googleapis";
import env from "#config/env/env.js";
import type { BoxTariffItemDto, TariffSheetRowDto } from "#types/dtos.js";
import { getLatestByTariffDate } from "#repositories/box-tariff-items.js";
import { withRetry } from "#utils/retry.js";
import knex from "#postgres/knex.js";

const SHEET_NAME = "stocks_coefs";
const COEF_KEYS = [
    "boxDeliveryCoef",
    "boxStorageCoef",
    "boxDeliveryMarketplaceCoef",
    "coef",
    "coefficient",
    "coefficientValue",
    "rate",
];

function getCoefValue(row: TariffSheetRowDto): number {
    for (const key of COEF_KEYS) {
        const v = row[key];
        if (typeof v === "number" && !Number.isNaN(v)) return v;
        if (typeof v === "string" && v.trim() !== "") {
            const n = Number(v);
            if (!Number.isNaN(n)) return n;
        }
    }
    return 0;
}

/**
 * Sorts tariff rows by coefficient ascending.
 */
export function sortTariffsByCoef(rows: TariffSheetRowDto[]): TariffSheetRowDto[] {
    return [...rows].sort((a, b) => getCoefValue(a) - getCoefValue(b));
}

function dtoToSheetRow(dto: BoxTariffItemDto): TariffSheetRowDto {
    const base: TariffSheetRowDto = {
        date: dto.tariff_date,
        geoName: dto.geo_name,
        warehouseName: dto.warehouse_name,
        boxDeliveryCoef: dto.box_delivery_coef,
        boxStorageCoef: dto.box_storage_coef,
        boxDeliveryMarketplaceCoef: dto.box_delivery_marketplace_coef,
    };

    // Include all extra WB fields, including boxDeliveryLiter and others,
    // from the key/value table.
    for (const [key, value] of Object.entries(dto.fields)) {
        if (value === null) continue;
        base[key] = value;
    }

    return base;
}

/**
 * Returns latest tariff data from DB (cached), sorted by coefficient ascending.
 */
export async function getLatestTariffsFromDb(): Promise<TariffSheetRowDto[]> {
    const dtos = await getLatestByTariffDate();
    const rows = dtos.map(dtoToSheetRow);
    if (rows.length === 0) return [];
    return sortTariffsByCoef(rows);
}

/**
 * Converts tariff rows to sheet rows: header row + data rows.
 */
function toSheetRows(rows: TariffSheetRowDto[]): (string | number)[][] {
    if (rows.length === 0) return [];
    const keys = Object.keys(rows[0]);
    const header = keys;
    const dataRows = rows.map((r) =>
        keys.map((k) => {
            const v = r[k];
            if (v === null || v === undefined) return "";
            if (typeof v === "boolean") return v ? "1" : "0";
            return v as string | number;
        })
    );
    return [header, ...dataRows];
}

async function ensureSheetExists(
    sheets: ReturnType<typeof google.sheets>,
    spreadsheetId: string
): Promise<void> {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetTitles =
        meta.data.sheets?.map((s) => s.properties?.title ?? "") ?? [];
    console.log(
        `[Sheets] Spreadsheet ${spreadsheetId} has sheets:`,
        JSON.stringify(sheetTitles)
    );
    const hasSheet = meta.data.sheets?.some(
        (s) => (s.properties?.title ?? "").trim() === SHEET_NAME
    );
    if (hasSheet) return;
    console.log(
        `[Sheets] Sheet ${SHEET_NAME} not found in ${spreadsheetId}, creating it.`
    );
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
            requests: [
                {
                    addSheet: {
                        properties: { title: SHEET_NAME },
                    },
                },
            ],
        },
    });
}

/**
 * Updates one spreadsheet's sheet "stocks_coefs" with tariff data from DB.
 */
export async function updateSpreadsheetWithTariffs(
    spreadsheetId: string
): Promise<void> {
    const auth = new google.auth.GoogleAuth({
        keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    await ensureSheetExists(sheets, spreadsheetId);

    const tariffs = await getLatestTariffsFromDb();
    const sheetRows = toSheetRows(tariffs);

    const range = `${SHEET_NAME}!A:ZZ`;
    // Clear the sheet first so we don't leave stale rows from a previous sync
    // (e.g. when Mar 4 has fewer rows than Mar 3, old Mar 3 rows would otherwise remain).
    await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range,
    });
    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_NAME}!A1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: sheetRows },
    });
}

/**
 * Returns spreadsheet IDs to sync: from DB table `spreadsheets` first; if empty, from env (SPREADSHEET_IDS / SPREADSHEET_ID).
 */
async function getSpreadsheetIds(): Promise<string[]> {
    try {
        const rows = await knex("spreadsheets").select("spreadsheet_id");
        const ids = (rows as { spreadsheet_id: string }[]).map(
            (r) => r.spreadsheet_id.trim()
        ).filter(Boolean);
        if (ids.length > 0) {
            console.log("[Sheets] Resolved spreadsheet IDs from DB:", ids);
            return ids;
        }
    } catch (e) {
        console.warn("[Sheets] Could not read spreadsheets from DB, using env:", e);
    }
    const rawList =
        (env.SPREADSHEET_IDS && env.SPREADSHEET_IDS.trim().length > 0
            ? env.SPREADSHEET_IDS
            : process.env.SPREADSHEET_ID ?? "") || "";
    const ids = rawList
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean) as string[];
    console.log("[Sheets] Resolved spreadsheet IDs from env:", ids);
    return ids;
}

/**
 * Syncs current tariffs from DB to all configured Google spreadsheets (with retry per sheet).
 */
export async function syncTariffsToAllSpreadsheets(): Promise<void> {
    const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!credsPath || !fs.existsSync(credsPath)) {
        console.log(
            "[Sheets] GOOGLE_APPLICATION_CREDENTIALS file not found; skipping Sheets sync."
        );
        return;
    }
    try {
        const stat = fs.statSync(credsPath);
        if (!stat.isFile()) {
            console.log(
                "[Sheets] GOOGLE_APPLICATION_CREDENTIALS points to a directory, not a file; skipping Sheets sync."
            );
            return;
        }
    } catch (e) {
        console.log(
            "[Sheets] Could not stat GOOGLE_APPLICATION_CREDENTIALS; skipping Sheets sync.",
            e
        );
        return;
    }

    const spreadsheetIds = await getSpreadsheetIds();
    if (spreadsheetIds.length === 0) return;

    for (const id of spreadsheetIds) {
        try {
            await withRetry(() => updateSpreadsheetWithTariffs(id), {
                maxAttempts: 3,
                delayMs: 1000,
                backoff: 2,
            });
        } catch (e) {
            console.error(`Failed to update spreadsheet ${id}:`, e);
        }
    }
}
