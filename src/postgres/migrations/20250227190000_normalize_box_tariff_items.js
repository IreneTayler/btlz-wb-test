/**
 * Normalized schema: add explicit coefficient columns to box_tariff_items.
 * Backfill from data jsonb; keep data for full payload.
 *
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export async function up(knex) {
    await knex.schema.alterTable("box_tariff_items", (table) => {
        table
            .string("box_delivery_coef_expr")
            .nullable()
            .comment("boxDeliveryCoefExpr from WB");
        table
            .string("box_storage_coef_expr")
            .nullable()
            .comment("boxStorageCoefExpr from WB");
        table
            .string("box_delivery_marketplace_coef_expr")
            .nullable()
            .comment("boxDeliveryMarketplaceCoefExpr from WB");
    });

    const rows = await knex("box_tariff_items").select("id", "data");
    for (const row of rows) {
        const data = typeof row.data === "string" ? JSON.parse(row.data) : row.data || {};
        const boxDeliveryCoefExpr =
            data.boxDeliveryCoefExpr != null ? String(data.boxDeliveryCoefExpr) : null;
        const boxStorageCoefExpr =
            data.boxStorageCoefExpr != null ? String(data.boxStorageCoefExpr) : null;
        const boxDeliveryMarketplaceCoefExpr =
            data.boxDeliveryMarketplaceCoefExpr != null
                ? String(data.boxDeliveryMarketplaceCoefExpr)
                : null;
        await knex("box_tariff_items")
            .where("id", row.id)
            .update({
                box_delivery_coef_expr: boxDeliveryCoefExpr,
                box_storage_coef_expr: boxStorageCoefExpr,
                box_delivery_marketplace_coef_expr: boxDeliveryMarketplaceCoefExpr,
            });
    }
}

/**
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export async function down(knex) {
    await knex.schema.alterTable("box_tariff_items", (table) => {
        table.dropColumn("box_delivery_coef_expr");
        table.dropColumn("box_storage_coef_expr");
        table.dropColumn("box_delivery_marketplace_coef_expr");
    });
}
