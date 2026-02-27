import { fetchAndSaveBoxTariffs } from "#services/wb-tariffs.js";
import { syncTariffsToAllSpreadsheets } from "#services/google-sheets.js";
import { runJob } from "#utils/jobs.js";

const INTERVAL_MS = 60 * 60 * 1000; // 1 hour

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
 * Starts hourly WB fetch and hourly Google Sheets sync.
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
}