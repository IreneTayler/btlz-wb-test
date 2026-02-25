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
 * Within a 20-minute window per (geo_name, warehouse_name), we update the latest row.
 * If more than 20 minutes have passed since created_at of the last row, we insert a new one.
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
    const twentyMinutesMs = 20 * 60 * 1000;

    function normalizeContent(obj: Record<string, unknown>): string {
        const entries = Object.entries(obj).filter(
            ([key]) => key !== "created_at" && key !== "updated_at"
        );
        entries.sort(([a], [b]) => a.localeCompare(b));
        return JSON.stringify(Object.fromEntries(entries));
    }

    await knex.transaction(async (trx) => {
        for (const rawItem of data) {
            const item = (rawItem ?? {}) as Record<string, unknown>;
            const geoName = String(item.geoName ?? "");
            const warehouseName = String(item.warehouseName ?? "");

            if (!geoName && !warehouseName) continue;

            const lastRow = await trx("box_tariff_items")
                .where({
                    tariff_date: dateOnly,
                    geo_name: geoName,
                    warehouse_name: warehouseName,
                })
                .orderBy("created_at", "desc")
                .first();

            // No previous row: always insert new
            if (!lastRow) {
                const payload = {
                    ...item,
                    created_at: now.toISOString(),
                    updated_at: now.toISOString(),
                };
                await trx("box_tariff_items").insert({
                    tariff_date: dateOnly,
                    geo_name: geoName,
                    warehouse_name: warehouseName,
                    data: JSON.stringify(payload),
                    created_at: now,
                    updated_at: now,
                });
                continue;
            }

            const existingRaw = typeof lastRow.data === "string"
                ? JSON.parse(lastRow.data)
                : lastRow.data;
            const existingContent = existingRaw && typeof existingRaw === "object"
                ? (existingRaw as Record<string, unknown>)
                : {};

            const sameContent =
                normalizeContent(existingContent) === normalizeContent(item);

            const createdAt = new Date(lastRow.created_at);
            const diffMs = now.getTime() - createdAt.getTime();

            if (sameContent) {
                // Data has not changed: do nothing (avoid duplicate registrations)
                continue;
            }

            if (diffMs >= twentyMinutesMs) {
                // New 20-minute bucket: insert a new row with fresh timestamps
                const payload = {
                    ...item,
                    created_at: now.toISOString(),
                    updated_at: now.toISOString(),
                };
                await trx("box_tariff_items").insert({
                    tariff_date: dateOnly,
                    geo_name: geoName,
                    warehouse_name: warehouseName,
                    data: JSON.stringify(payload),
                    created_at: now,
                    updated_at: now,
                });
            } else {
                // Same 20-minute bucket: update latest row with new data and updated_at
                const payload = {
                    ...item,
                    created_at:
                        typeof existingContent.created_at === "string"
                            ? (existingContent.created_at as string)
                            : createdAt.toISOString(),
                    updated_at: now.toISOString(),
                };
                await trx("box_tariff_items")
                    .where({ id: lastRow.id })
                    .update({
                        data: JSON.stringify(payload),
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
