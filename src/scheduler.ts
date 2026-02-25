import { fetchAndSaveBoxTariffs } from "#services/wb-tariffs.js";
import { syncTariffsToAllSpreadsheets } from "#services/google-sheets.js";

const INTERVAL_MS = 60 * 60 * 1000; // 1 hour

async function runWbJob(): Promise<void> {
    try {
        await fetchAndSaveBoxTariffs();
        console.log("[WB] Box tariffs fetched and saved.");
    } catch (e) {
        console.error("[WB] Error:", e);
    }
}

async function runSheetsJob(): Promise<void> {
    try {
        await syncTariffsToAllSpreadsheets();
        console.log("[Sheets] Tariffs synced to spreadsheets.");
    } catch (e) {
        console.error("[Sheets] Error:", e);
    }
}

/**
 * Starts hourly WB fetch and hourly Google Sheets sync.
 */
export function startScheduler(): void {
    runWbJob();
    setInterval(runWbJob, INTERVAL_MS);

    runSheetsJob();
    setInterval(runSheetsJob, INTERVAL_MS);
}