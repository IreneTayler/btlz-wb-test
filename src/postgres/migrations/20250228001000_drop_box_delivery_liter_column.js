/**
 * Drop box_delivery_liter numeric column; keep boxDeliveryLiter only in box_tariff_item_fields.
 *
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export async function up(knex) {
    const hasTable = await knex.schema.hasTable("box_tariff_items");
    if (!hasTable) return;

    await knex.schema.raw(
        "ALTER TABLE box_tariff_items " +
            "DROP CONSTRAINT IF EXISTS box_tariff_items_box_delivery_liter_nonneg"
    );

    await knex.schema.raw(
        "ALTER TABLE box_tariff_items " +
            "DROP COLUMN IF EXISTS box_delivery_liter"
    );
}

/**
 * Recreate box_delivery_liter column for rollback only (without backfilling).
 *
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export async function down(knex) {
    const hasTable = await knex.schema.hasTable("box_tariff_items");
    if (!hasTable) return;

    const hasColumn = await knex.schema.hasColumn(
        "box_tariff_items",
        "box_delivery_liter"
    );
    if (!hasColumn) {
        await knex.schema.alterTable("box_tariff_items", (table) => {
            table.decimal("box_delivery_liter", null).nullable();
        });
    }
}

