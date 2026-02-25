import knex from "#postgres/knex.js";
import env from "#config/env/env.js";
import type { WbBoxTariffsResponse } from "#types/wb-tariffs.js";

const WB_BOX_TARIFFS_URL = "https://common-api.wildberries.ru/api/v1/tariffs/box";

let boxTariffItemsTableEnsured = false;

async function ensureBoxTariffItemsTable(): Promise<void> {
    if (boxTariffItemsTableEnsured) return;
    const exists = await knex.schema.hasTable("box_tariff_items");
    if (!exists) {
        await knex.schema.createTable("box_tariff_items", (table) => {
            table.bigIncrements("id").primary();
            table
                .date("tariff_date")
                .notNullable()
                .comment("Day for which this tariff row applies");
            table.string("geo_name").notNullable().comment("geoName from WB API");
            table.string("warehouse_name").notNullable().comment("warehouseName from WB API");
            table
                .jsonb("data")
                .notNullable()
                .comment("Single tariff row payload from WB API for this geo/warehouse/date");
            table
                .timestamp("created_at", { useTz: true })
                .notNullable()
                .defaultTo(knex.fn.now())
                .comment("Time when this tariff row was first saved");
            table
                .timestamp("updated_at", { useTz: true })
                .notNullable()
                .defaultTo(knex.fn.now())
                .comment("Time when this tariff row was last updated");

            table.unique(["tariff_date", "geo_name", "warehouse_name"], {
                indexName: "box_tariff_items_unique_per_day_geo_wh",
            });
        });
    }
    boxTariffItemsTableEnsured = true;
}

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
 * Each WB tariff element is stored as its own row in box_tariff_items.
 * Hourly runs for the same day update existing rows (created_at preserved, updated_at refreshed).
 */
export async function saveBoxTariffsForDate(
    tariffDate: Date,
    data: WbBoxTariffsResponse
): Promise<void> {
    const dateOnly = tariffDate.toISOString().slice(0, 10);

    if (!Array.isArray(data) || data.length === 0) {
        return;
    }

    await ensureBoxTariffItemsTable();

    await knex.transaction(async (trx) => {
        for (const rawItem of data) {
            const item = rawItem ?? {};
            const geoName = String((item as any).geoName ?? "");
            const warehouseName = String((item as any).warehouseName ?? "");

            await trx("box_tariff_items")
                .insert({
                    tariff_date: dateOnly,
                    geo_name: geoName,
                    warehouse_name: warehouseName,
                    data: JSON.stringify(item),
                    created_at: trx.fn.now(),
                    updated_at: trx.fn.now(),
                })
                .onConflict(["tariff_date", "geo_name", "warehouse_name"])
                .merge({
                    data: JSON.stringify(item),
                    updated_at: trx.fn.now(),
                });
        }
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
