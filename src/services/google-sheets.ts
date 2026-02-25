import fs from "fs";
import { google } from "googleapis";
import knex from "#postgres/knex.js";
import env from "#config/env/env.js";

const SHEET_NAME = "stocks_coefs";
const COEF_KEYS = [
    // WB box tariffs specific keys (strings with numeric content)
    "boxDeliveryCoefExpr",
    "boxStorageCoefExpr",
    "boxDeliveryMarketplaceCoefExpr",
    // generic fallbacks
    "coef",
    "coefficient",
    "coefficientValue",
    "rate",
];

type TariffRow = Record<string, string | number | boolean | null | undefined>;

function getCoefValue(row: TariffRow): number {
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
 * Sorts tariff rows by coefficient ascending (by key coef/coefficient/coefficientValue/rate).
 */
export function sortTariffsByCoef(rows: TariffRow[]): TariffRow[] {
    return [...rows].sort((a, b) => getCoefValue(a) - getCoefValue(b));
}

/**
 * Returns latest tariff data from DB (latest tariff_date), sorted by coefficient ascending.
 * Reads from box_tariff_items, where each WB tariff element is stored as its own row.
 */
export async function getLatestTariffsFromDb(): Promise<TariffRow[]> {
    const latest = await knex("box_tariff_items")
        .max("tariff_date as max_date")
        .first();
    const maxDate = latest?.max_date as string | Date | undefined;
    if (!maxDate) return [];

    const rows = await knex("box_tariff_items")
        .where("tariff_date", maxDate)
        .select("data");

    const items: TariffRow[] = [];
    for (const row of rows as { data: unknown }[]) {
        const d = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
        if (d && typeof d === "object") {
            items.push(d as TariffRow);
        }
    }

    if (items.length === 0) return [];
    // items already include date field added at save time
    return sortTariffsByCoef(items);
}

/**
 * Converts tariff rows to sheet rows: header row + data rows (values only, same order as first object keys).
 */
function toSheetRows(rows: TariffRow[]): (string | number)[][] {
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
export async function updateSpreadsheetWithTariffs(spreadsheetId: string): Promise<void> {
    const auth = new google.auth.GoogleAuth({
        keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    await ensureSheetExists(sheets, spreadsheetId);

    const tariffs = await getLatestTariffsFromDb();
    const sheetRows = toSheetRows(tariffs);

    const range = `${SHEET_NAME}!A:ZZ`;
    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: sheetRows },
    });
}

/** Resolves spreadsheet IDs only from env (SPREADSHEET_IDS or SPREADSHEET_ID). */
async function getSpreadsheetIds(): Promise<string[]> {
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
 * Syncs current tariffs from DB to all configured Google spreadsheets.
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
            await updateSpreadsheetWithTariffs(id);
        } catch (e) {
            console.error(`Failed to update spreadsheet ${id}:`, e);
        }
    }
}
