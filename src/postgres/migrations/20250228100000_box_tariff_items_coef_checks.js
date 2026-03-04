/**
 * Add CHECK constraints for numeric coefficient columns (non-negative where applicable).
 *
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export async function up(knex) {
    await knex.schema.raw(
        "ALTER TABLE box_tariff_items " +
            "ADD CONSTRAINT box_tariff_items_box_delivery_coef_nonneg " +
            "CHECK (box_delivery_coef IS NULL OR box_delivery_coef >= 0)"
    );
    await knex.schema.raw(
        "ALTER TABLE box_tariff_items " +
            "ADD CONSTRAINT box_tariff_items_box_storage_coef_nonneg " +
            "CHECK (box_storage_coef IS NULL OR box_storage_coef >= 0)"
    );
    await knex.schema.raw(
        "ALTER TABLE box_tariff_items " +
            "ADD CONSTRAINT box_tariff_items_box_delivery_marketplace_coef_nonneg " +
            "CHECK (box_delivery_marketplace_coef IS NULL OR box_delivery_marketplace_coef >= 0)"
    );
}

/**
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export async function down(knex) {
    await knex.schema.raw(
        "ALTER TABLE box_tariff_items DROP CONSTRAINT IF EXISTS box_tariff_items_box_delivery_coef_nonneg"
    );
    await knex.schema.raw(
        "ALTER TABLE box_tariff_items DROP CONSTRAINT IF EXISTS box_tariff_items_box_storage_coef_nonneg"
    );
    await knex.schema.raw(
        "ALTER TABLE box_tariff_items DROP CONSTRAINT IF EXISTS box_tariff_items_box_delivery_marketplace_coef_nonneg"
    );
}
