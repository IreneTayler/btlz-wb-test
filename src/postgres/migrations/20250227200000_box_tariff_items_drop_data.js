/**
 * Drop jsonb data column from box_tariff_items.
 *
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export async function up(knex) {
    await knex.schema.alterTable("box_tariff_items", (table) => {
        table.dropColumn("data");
    });
}

/**
 * Recreate data column as jsonb (empty), without restoring historical payloads.
 *
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export async function down(knex) {
    await knex.schema.alterTable("box_tariff_items", (table) => {
        table
            .jsonb("data")
            .nullable()
            .comment("Single WB tariff row (recreated, without historical payloads)");
    });
}

