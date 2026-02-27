import knex from "#postgres/knex.js";
import type {
    WbBoxTariffRow,
    BoxTariffItemDto,
    BoxTariffItemInsertDto,
} from "#types/dtos.js";
import { getCached, setCached, invalidateCache } from "#utils/cache.js";
import type { Knex } from "knex";

const TABLE = "box_tariff_items";
const FIELDS_TABLE = "box_tariff_item_fields";
const CACHE_KEY_LATEST = "box_tariff_items:latest";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const RESERVED_WB_KEYS = new Set<string>([
    "geoName",
    "warehouseName",
    "boxDeliveryCoefExpr",
    "boxStorageCoefExpr",
    "boxDeliveryMarketplaceCoefExpr",
]);

function wbRowToInsertDto(
    dateOnly: string,
    item: WbBoxTariffRow
): BoxTariffItemInsertDto {
    const raw = item as Record<string, unknown>;
    const geoName = String(raw.geoName ?? "");
    const warehouseName = String(raw.warehouseName ?? "");

    const parseNum = (v: unknown): number | null => {
        if (v === null || v === undefined) return null;
        const n = Number(v);
        return Number.isNaN(n) ? null : n;
    };

    return {
        tariff_date: dateOnly,
        geo_name: geoName,
        warehouse_name: warehouseName,
        box_delivery_coef: parseNum(raw.boxDeliveryCoefExpr),
        box_storage_coef: parseNum(raw.boxStorageCoefExpr),
        box_delivery_marketplace_coef: parseNum(
            raw.boxDeliveryMarketplaceCoefExpr
        ),
    };
}

function dbRowToDto(
    row: Record<string, unknown>,
    fields: Record<string, string | null>
): BoxTariffItemDto {
    return {
        id: Number(row.id),
        tariff_date: String(row.tariff_date),
        geo_name: String(row.geo_name),
        warehouse_name: String(row.warehouse_name),
        box_delivery_coef:
            row.box_delivery_coef != null ? Number(row.box_delivery_coef) : null,
        box_storage_coef:
            row.box_storage_coef != null ? Number(row.box_storage_coef) : null,
        box_delivery_marketplace_coef:
            row.box_delivery_marketplace_coef != null
                ? Number(row.box_delivery_marketplace_coef)
                : null,
        created_at: row.created_at as Date,
        updated_at: row.updated_at as Date,
        fields,
    };
}

async function replaceFieldsForItem(
    trx: Knex.Transaction,
    itemId: number,
    raw: Record<string, unknown>
): Promise<void> {
    await trx(FIELDS_TABLE).where({ box_tariff_item_id: itemId }).del();

    const rows: {
        box_tariff_item_id: number;
        field_key: string;
        field_value: string | null;
        value_num: number | null;
        value_bool: boolean | null;
        value_json: unknown | null;
    }[] = [];

    for (const [key, value] of Object.entries(raw)) {
        if (RESERVED_WB_KEYS.has(key)) continue;
        let fieldValue: string | null = null;
        let valueNum: number | null = null;
        let valueBool: boolean | null = null;
        let valueJson: unknown | null = null;

        if (value === null || value === undefined) {
            fieldValue = null;
        } else if (typeof value === "string") {
            fieldValue = value;
            const asNum = Number(value);
            if (!Number.isNaN(asNum)) {
                valueNum = asNum;
            }
        } else if (typeof value === "number") {
            fieldValue = String(value);
            valueNum = value;
        } else if (typeof value === "boolean") {
            fieldValue = String(value);
            valueBool = value;
        } else {
            fieldValue = JSON.stringify(value);
            valueJson = value;
        }
        rows.push({
            box_tariff_item_id: itemId,
            field_key: key,
            field_value: fieldValue,
            value_num: valueNum,
            value_bool: valueBool,
            value_json: valueJson,
        });
    }

    if (rows.length > 0) {
        await trx(FIELDS_TABLE).insert(rows);
    }
}

/**
 * Upserts box tariff items for the given date.
 * One row per (tariff_date, warehouse_name); existing row is updated.
 * All WB fields (including ones without dedicated columns) are stored in key/value table.
 */
export async function upsertForDate(
    tariffDate: Date,
    items: WbBoxTariffRow[]
): Promise<void> {
    const dateOnly = tariffDate.toISOString().slice(0, 10);
    if (!Array.isArray(items) || items.length === 0) return;

    const now = new Date();
    await knex.transaction(async (trx) => {
        for (const rawItem of items) {
            const dto = wbRowToInsertDto(dateOnly, rawItem);
            if (!dto.geo_name && !dto.warehouse_name) continue;

            const payload = {
                tariff_date: dto.tariff_date,
                geo_name: dto.geo_name,
                warehouse_name: dto.warehouse_name,
                box_delivery_coef: dto.box_delivery_coef,
                box_storage_coef: dto.box_storage_coef,
                box_delivery_marketplace_coef:
                    dto.box_delivery_marketplace_coef,
                updated_at: now,
            };

            const insertPayload = {
                ...payload,
                created_at: now,
            };

            const inserted = await trx(TABLE)
                .insert(insertPayload)
                .onConflict(["tariff_date", "warehouse_name"])
                .merge(payload)
                .returning("id");
            const row = Array.isArray(inserted) ? inserted[0] : inserted;
            const itemId = Number((row as { id: number }).id);

            await replaceFieldsForItem(trx as Knex.Transaction, itemId, rawItem as Record<string, unknown>);
        }
    });
    invalidateCache(CACHE_KEY_LATEST);
}

/**
 * Returns items for the latest tariff_date.
 * Uses in-memory cache with TTL to avoid repeated DB hits.
 */
export async function getLatestByTariffDate(): Promise<BoxTariffItemDto[]> {
    const cached = getCached<BoxTariffItemDto[]>(CACHE_KEY_LATEST);
    if (cached !== undefined) return cached;

    const latest = await knex(TABLE).max("tariff_date as max_date").first();
    const maxDate = latest?.max_date as string | undefined;
    if (!maxDate) return [];

    const rows = (await knex(TABLE)
        .where("tariff_date", maxDate)
        .select("*")) as Record<string, unknown>[];

    const ids = rows.map((r) => Number(r.id));
    if (ids.length === 0) return [];

    const fieldRows = await knex(FIELDS_TABLE)
        .whereIn("box_tariff_item_id", ids)
        .select("box_tariff_item_id", "field_key", "field_value");

    const fieldsByItem = new Map<number, Record<string, string | null>>();
    for (const row of fieldRows as {
        box_tariff_item_id: number;
        field_key: string;
        field_value: string | null;
    }[]) {
        const id = Number(row.box_tariff_item_id);
        let map = fieldsByItem.get(id);
        if (!map) {
            map = {};
            fieldsByItem.set(id, map);
        }
        map[row.field_key] = row.field_value;
    }

    const dtos = rows.map((row) =>
        dbRowToDto(row, fieldsByItem.get(Number(row.id)) ?? {})
    );
    setCached(CACHE_KEY_LATEST, dtos, CACHE_TTL_MS);
    return dtos;
}
