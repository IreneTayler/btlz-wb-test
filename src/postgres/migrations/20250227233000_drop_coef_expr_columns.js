/**
 * Drop *_coef_expr columns from box_tariff_items now that numeric fields are used.
 *
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export async function up(knex) {
    const hasTable = await knex.schema.hasTable("box_tariff_items");
    if (!hasTable) return;

    await knex.schema.alterTable("box_tariff_items", (table) => {
        // These columns may or may not exist depending on previous migrations,
        // so we use raw DROP COLUMN with IF EXISTS below instead of table.dropColumn.
    });

    await knex.schema.raw(
        'ALTER TABLE box_tariff_items ' +
            'DROP COLUMN IF EXISTS box_delivery_coef_expr, ' +
            'DROP COLUMN IF EXISTS box_storage_coef_expr, ' +
            'DROP COLUMN IF EXISTS box_delivery_marketplace_coef_expr'
    );
}

/**
 * Recreate *_coef_expr columns (empty) for rollback only.
 *
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export async function down(knex) {
    const hasTable = await knex.schema.hasTable("box_tariff_items");
    if (!hasTable) return;

    const exists = await knex.schema.hasColumn(
        "box_tariff_items",
        "box_delivery_coef_expr"
    );
    if (!exists) {
        await knex.schema.alterTable("box_tariff_items", (table) => {
            table.string("box_delivery_coef_expr").nullable();
            table.string("box_storage_coef_expr").nullable();
            table.string("box_delivery_marketplace_coef_expr").nullable();
        });
    }
}

