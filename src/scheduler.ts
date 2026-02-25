import { fetchAndSaveBoxTariffs } from "#services/wb-tariffs.js";
import { syncTariffsToAllSpreadsheets } from "#services/google-sheets.js";

const INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

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
 * Starts 2-minute WB fetch and 2-minute Google Sheets sync.
 */
export function startScheduler(): void {
    runWbJob();
    setInterval(runWbJob, INTERVAL_MS);

    runSheetsJob();
    setInterval(runSheetsJob, INTERVAL_MS);
}
