import { fetchAndSaveBoxTariffs } from "#services/wb-tariffs.js";
import { syncTariffsToAllSpreadsheets } from "#services/google-sheets.js";
import { runJob } from "#utils/jobs.js";

const INTERVAL_MS = 60 * 1000; // 1 hour
const DAILY_HOUR = 0;
const DAILY_MINUTE = 1; // 00:01 — start of day, after midnight

/**
 * Returns milliseconds until the next 00:01 (server local time).
 */
function getMsUntilNext001(): number {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), DAILY_HOUR, DAILY_MINUTE, 0, 0);
    if (next.getTime() <= now.getTime()) {
        next.setDate(next.getDate() + 1);
    }
    return next.getTime() - now.getTime();
}

/**
 * Runs the Wildberries tariffs fetch/save job with centralized logging and error handling.
 */
async function runWbJob(): Promise<void> {
    await runJob("wb-tariffs", fetchAndSaveBoxTariffs);
}

/**
 * Runs the Google Sheets sync job with centralized logging and error handling.
 */
async function runSheetsJob(): Promise<void> {
    await runJob("google-sheets-sync", syncTariffsToAllSpreadsheets);
}

/**
 * Schedules Google Sheets sync daily at 00:01 (start of day, after midnight), then reschedules for the next day.
 */
function scheduleDailySheetsSync(): void {
    function runAt001(): void {
        void runJob("google-sheets-sync-daily", syncTariffsToAllSpreadsheets);
        setTimeout(runAt001, getMsUntilNext001());
    }
    setTimeout(runAt001, getMsUntilNext001());
}

/**
 * Starts hourly WB fetch, hourly Google Sheets sync, and daily Sheets sync at 00:01.
 */
export function startScheduler(): void {
    void runWbJob();
    setInterval(() => {
        void runWbJob();
    }, INTERVAL_MS);

    void runSheetsJob();
    setInterval(() => {
        void runSheetsJob();
    }, INTERVAL_MS);

    scheduleDailySheetsSync();
}