/**
 * DTOs for DB and sheet layer.
 * WB API types live in wb-tariffs.ts.
 */

/** Single box tariff row from WB API (flexible for unknown fields). */
export type WbBoxTariffRow = Record<
    string,
    string | number | boolean | null | undefined
>;

/** API response: array of tariff rows. */
export type WbBoxTariffsResponse = WbBoxTariffRow[];

/**
 * Normalized DB row for box_tariff_items.
 * Mirrors table columns; additional WB fields are stored separately in key/value table.
 */
export interface BoxTariffItemDto {
    id: number;
    tariff_date: string;
    geo_name: string;
    warehouse_name: string;
    box_delivery_coef: number | null;
    box_storage_coef: number | null;
    box_delivery_marketplace_coef: number | null;
    created_at: Date;
    updated_at: Date;
    /** All extra WB fields for this row, keyed by original field name. */
    fields: Record<string, string | null>;
}

/**
 * Input for upsert: WB row mapped to DB columns (no id, created_at, updated_at).
 */
export interface BoxTariffItemInsertDto {
    tariff_date: string;
    geo_name: string;
    warehouse_name: string;
    box_delivery_coef: number | null;
    box_storage_coef: number | null;
    box_delivery_marketplace_coef: number | null;
}

/** Single key/value field associated with a box_tariff_item. */
export interface BoxTariffItemFieldDto {
    box_tariff_item_id: number;
    key: string;
    value: string | null;
}

/**
 * One row sent to Google Sheets (header + values).
 * Keys are column names; values are string | number | boolean | null.
 * We expose normalized fields explicitly (no jsonb).
 */
export type TariffSheetRowDto = Record<
    string,
    string | number | boolean | null | undefined
>;
