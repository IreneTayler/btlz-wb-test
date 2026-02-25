import knex from "#postgres/knex.js";
import env from "#config/env/env.js";
import type { WbBoxTariffsResponse } from "#types/wb-tariffs.js";

const WB_BOX_TARIFFS_URL = "https://common-api.wildberries.ru/api/v1/tariffs/box";

/**
 * Fetches box tariffs from WB API.
 * WB requires a `date` query parameter (YYYY-MM-DD).
 */
export async function fetchBoxTariffs(forDate: Date): Promise<WbBoxTariffsResponse> {
    const dateStr = forDate.toISOString().slice(0, 10);
    const url = new URL(WB_BOX_TARIFFS_URL);
    url.searchParams.set("date", dateStr);

    const res = await fetch(url.toString(), {
        method: "GET",
        headers: {
            Authorization: env.WB_API_TOKEN,
            "Content-Type": "application/json",
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`WB API error ${res.status}: ${text}`);
    }
    const data: unknown = await res.json();

    // Try to extract tariffs array robustly from any nesting level.
    const arrays: unknown[] = [];

    function collectArrays(value: unknown, depth: number) {
        if (depth > 6) return; // avoid pathological structures
        if (Array.isArray(value)) {
            if (value.length === 0 || typeof value[0] === "object") {
                arrays.push(value);
            }
            for (const item of value) collectArrays(item, depth + 1);
            return;
        }
        if (value && typeof value === "object") {
            for (const v of Object.values(value as Record<string, unknown>)) {
                collectArrays(v, depth + 1);
            }
        }
    }

    collectArrays(data, 0);

    if (arrays.length > 0) {
        return arrays[0] as WbBoxTariffsResponse;
    }

    console.warn(
        "WB API box tariffs: could not find an array of tariffs in response; storing empty list."
    );
    return [];
}

/**
 * Saves or updates box tariffs for the given date (UTC date used as day).
 * Hourly runs for the same day update the same row.
 */
export async function saveBoxTariffsForDate(
    tariffDate: Date,
    data: WbBoxTariffsResponse
): Promise<void> {
    const dateOnly = tariffDate.toISOString().slice(0, 10);
    await knex("box_tariffs")
        .insert({
            tariff_date: dateOnly,
            data: JSON.stringify(data),
            updated_at: knex.fn.now(),
        })
        .onConflict("tariff_date")
        .merge({
            data: JSON.stringify(data),
            updated_at: knex.fn.now(),
        });
}

/**
 * Fetches from WB and saves/updates for today (UTC).
 */
export async function fetchAndSaveBoxTariffs(): Promise<void> {
    const now = new Date();
    const data = await fetchBoxTariffs(now);
    await saveBoxTariffsForDate(now, data);
}
