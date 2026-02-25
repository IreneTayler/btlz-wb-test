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
 * - Every 2 minutes: existing rows for the current 5-minute window are updated.
 * - After 5 minutes have passed since the last created_at, a new row is added.
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

    const now = new Date();
    const bucketMs = 5 * 60 * 1000; // 5-minute bucket for new rows

    await knex.transaction(async (trx) => {
        for (const rawItem of data) {
            const item = (rawItem ?? {}) as Record<string, unknown>;
            const geoName = String(item.geoName ?? "");
            const warehouseName = String(item.warehouseName ?? "");

            if (!geoName && !warehouseName) continue;

            const payloadBase = {
                ...item,
                date: dateOnly,
            };

            const lastRow = await trx("box_tariff_items")
                .where({
                    tariff_date: dateOnly,
                    warehouse_name: warehouseName,
                })
                .orderBy("created_at", "desc")
                .first();

            if (!lastRow) {
                // No previous row: insert a new one for this geo/warehouse
                await trx("box_tariff_items").insert({
                    tariff_date: dateOnly,
                    geo_name: geoName,
                    warehouse_name: warehouseName,
                    data: JSON.stringify(payloadBase),
                    created_at: now,
                    updated_at: now,
                });
                continue;
            }

            const createdAt = new Date(lastRow.created_at);
            const diffMs = now.getTime() - createdAt.getTime();

            if (diffMs < bucketMs) {
                // Same 5-minute window: update existing row (2-minute refresh)
                await trx("box_tariff_items")
                    .where({ id: lastRow.id })
                    .update({
                        data: JSON.stringify(payloadBase),
                        updated_at: now,
                    });
            } else {
                // New 5-minute window: add a new row
                await trx("box_tariff_items").insert({
                    tariff_date: dateOnly,
                    geo_name: geoName,
                    warehouse_name: warehouseName,
                    data: JSON.stringify(payloadBase),
                    created_at: now,
                    updated_at: now,
                });
            }
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
